"use client";
import { useState } from "react";
import { Song } from "../data/songs";

interface Props { song: Song; }

export default function LyricCard({ song }: Props) {
  const [revealed, setRevealed] = useState([]);
  const [done, setDone] = useState(false);
  const toggle = (i) => {
    const next = revealed.includes(i) ? revealed.filter(n=>n!==i) : [...revealed,i];
    setRevealed(next);
    if(next.length === song.lines.length) setDone(true); else setDone(false);
  };
  const reset = () => { setRevealed([]); setDone(false); };
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 max-w-xl w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-1">{song.title}</h2>
      <p className="text-sm text-gray-500 mb-6">{song.composer}</p>
      <div className="space-y-3">
        {song.lines.map((line, i) => (
          <button key={i} onClick={()=>toggle(i)}
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