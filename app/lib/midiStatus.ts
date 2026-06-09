import {
  getLatestCompleteMidiAlignmentForSource,
  getLatestMidiAlignmentForSource,
  getLatestMidiSourceForSong,
  getSegmentsBySongId,
} from "../../db/queries";
import {
  deriveSegmentAnswerKeys,
  deriveWholeSongAnswerKey,
  type MidiCleanupSettings,
} from "./midiGuidedTapPractice";

const DEFAULT_CLEANUP_SETTINGS: MidiCleanupSettings = {
  shortNoteThresholdMs: 0,
  simultaneousThresholdMs: 30,
};

export async function buildMidiStatus(songId: string, userId: string) {
  const source = await getLatestMidiSourceForSong(songId, userId);
  const alignment = source ? await getLatestMidiAlignmentForSource(source.id, userId) : null;
  const completeAlignment = source ? await getLatestCompleteMidiAlignmentForSource(source.id, userId) : null;
  const wholeSongAnswerKey = source && completeAlignment
    ? deriveWholeSongAnswerKey(songId, source.id, source.cleanedNotes, completeAlignment)
    : null;
  const segments = wholeSongAnswerKey ? await getSegmentsBySongId(songId) : [];
  const segmentAnswerKeys = wholeSongAnswerKey
    ? deriveSegmentAnswerKeys(wholeSongAnswerKey, segments)
    : {};
  const segmentsWithDerivedNotes = Object.values(segmentAnswerKeys)
    .filter((answerKey) => answerKey.notes.length > 0)
    .length;

  return {
    source,
    alignment,
    completeAlignment,
    wholeSongAnswerKey,
    segmentAnswerKeys,
    summary: source
      ? {
          hasMidi: true,
          rawNoteCount: source.rawNoteCount,
          cleanedNoteCount: source.cleanedNoteCount,
          ignoredShortNoteCount: source.ignoredShortNoteCount,
          shortNoteThresholdMs: source.cleanupSettings.shortNoteThresholdMs,
          alignedCount: alignment?.tappedStartTimesSeconds.length ?? 0,
          retainedMidiNoteCount: source.cleanedNoteCount,
          hasCompleteAlignment: Boolean(completeAlignment),
          hasDerivedAnswerKey: Boolean(wholeSongAnswerKey),
          derivedSegmentCount: segments.length,
          segmentsWithDerivedNotes,
          latestAlignmentDate: alignment?.updatedAt ?? null,
        }
      : {
          hasMidi: false,
          rawNoteCount: 0,
          cleanedNoteCount: 0,
          ignoredShortNoteCount: 0,
          shortNoteThresholdMs: DEFAULT_CLEANUP_SETTINGS.shortNoteThresholdMs,
          alignedCount: 0,
          retainedMidiNoteCount: 0,
          hasCompleteAlignment: false,
          hasDerivedAnswerKey: false,
          derivedSegmentCount: 0,
          segmentsWithDerivedNotes: 0,
          latestAlignmentDate: null,
        },
  };
}
