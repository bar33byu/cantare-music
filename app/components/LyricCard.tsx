"use client";
import { useState } from "react";
import { Song } from "../data/songs";
interface Props { song: Song; }
export default function LyricCard({ song }: Props) {
  const [revealed, setRevealed] = useState<number[]>([]);
  const [done, setDone] = useState<boolean>(false);
  const toggle = (i: number) => {
    const next = revealed.includes(i) ? revealed.filter((n: number) => n !== i) : [...revealed, i];
    setRevealed(next);
    setDone(next.length === song.lines.length);
  };
  const reset = () => { setRevealed([]); setDone(false); };
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 max-w-xl w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-1">{song.title}</h2>
      <p className="text-sm text-gray-500 mb-6">{song.composer}</p>
      <div className="space-y-3">
        {song.lines.map((line: string, i: number) => (
          <button key={i} onClick={() => toggle(i)}
            className={revealed.includes(i)
              ? "w-full text-left px-4 py-3 rounded-lg bg-indigo-100 text-indigo-900 text-lg font-medium transition-all"
              : "w-full text-left px-4 py-3 rounded-lg bg-gray-200 text-gray-200 text-lg font-medium select-none transition-all"}>
            {revealed.includes(i) ? line : "•".repeat(line.length)}
          </button>
        ))}
      </div>
      {done && <div className="mt-6 text-center">
        <p className="text-green-600 font-semibold text-lg mb-3">All lines revealed!</p>
        <button onClick={reset} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">Practice Again</button>
      </div>}
      {!done && <p className="mt-6 text-center text-sm text-gray-400">Click each line to reveal it</p>}
    </div>
  );
}