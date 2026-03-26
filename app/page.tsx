"use client";
import { useState } from "react";
import { songs } from "./data/songs";
import LyricCard from "./components/LyricCard";

export default function Home() {
  const [selected, setSelected] = useState(songs[0]);
  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col items-center py-12 px-4">
      <h1 className="text-4xl font-extrabold text-indigo-800 mb-2">Cantare</h1>
      <p className="text-gray-500 mb-8 text-center">Click each line to reveal it. Practice until you know it by heart.</p>
      <div className="flex gap-3 mb-8 flex-wrap justify-center">
        {songs.map(s => (
          <button key={s.id} onClick={()=>setSelected(s)}
            className={s.id===selected.id
              ? "px-4 py-2 rounded-full bg-indigo-600 text-white font-semibold shadow"
              : "px-4 py-2 rounded-full bg-white text-indigo-600 font-semibold border border-indigo-200 hover:bg-indigo-50"}>
            {s.title}
          </button>
        ))}
      </div>
      <LyricCard song={selected} />
    </main>
  );
}