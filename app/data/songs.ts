export interface Song {
  id: string;
  title: string;
  composer: string;
  lines: string[];
}

export const songs: Song[] = [
  {
    id: "1",
    title: "Amazing Grace",
    composer: "John Newton",
    lines: [
      "Amazing grace how sweet the sound",
      "That saved a wretch like me",
      "I once was lost but now am found",
      "Was blind but now I see",
    ],
  },
  {
    id: "2",
    title: "How Great Thou Art",
    composer: "Carl Boberg",
    lines: [
      "O Lord my God when I in awesome wonder",
      "Consider all the worlds thy hands have made",
      "I see the stars I hear the rolling thunder",
      "Thy power throughout the universe displayed",
    ],
  },
];
