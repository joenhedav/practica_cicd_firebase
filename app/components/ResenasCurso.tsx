"use client";
// app/components/ResenasCurso.tsx — Práctica 4. Formulario + lista en tiempo real + resumen.

import { useEffect, useState, type FormEvent } from "react";
import { borrarResena, escucharResenas, guardarResena, resumenDe, type Resena } from "@/lib/resenas";

export default function ResenasCurso({ cursoId, uid }: { cursoId: string; uid: string | null }) {
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [resumen, setResumen] = useState<{ cantidad: number; promedio: number | null } | null>(null);
  const [soloCinco, setSoloCinco] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suscripción en tiempo real: se cancela al desmontar o al cambiar de curso/filtro.
  useEffect(() => {
    return escucharResenas(cursoId, setResenas, (e) => setError(e.message), soloCinco);
  }, [cursoId, soloCinco]);

  useEffect(() => {
    resumenDe(cursoId)
      .then(setResumen)
      .catch((e: Error) => setError(e.message));
  }, [cursoId, resenas.length]); // recalcular cuando cambia la cantidad (no es en tiempo real)

  const mia = resenas.find((r) => r.uid === uid);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await guardarResena(cursoId, Number(f.get("puntaje")), String(f.get("texto")), !mia);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onBorrar() {
    try {
      await borrarResena(cursoId);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section>
      <h3>
        Reseñas {resumen && resumen.cantidad > 0 && `· ★ ${resumen.promedio?.toFixed(1)} (${resumen.cantidad})`}
      </h3>
      <label>
        <input type="checkbox" checked={soloCinco} onChange={(e) => setSoloCinco(e.target.checked)} /> Solo 5
        estrellas
      </label>
      {uid ? (
        <form onSubmit={onSubmit}>
          <select name="puntaje" defaultValue={mia?.puntaje ?? 5}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>
          <textarea name="texto" maxLength={500} defaultValue={mia?.texto ?? ""} required />
          <button type="submit">{mia ? "Actualizar mi reseña" : "Publicar"}</button>
          {mia && (
            <button type="button" onClick={onBorrar}>
              Borrar mi reseña
            </button>
          )}
        </form>
      ) : (
        <small className="hint">Ingresá para dejar una reseña</small>
      )}
      {error && <p role="alert">{error}</p>}
      <ul>
        {resenas.map((r) => (
          <li key={r.uid}>
            <strong>{"★".repeat(r.puntaje)}</strong> {r.texto} — <em>{r.autor}</em>
          </li>
        ))}
      </ul>
    </section>
  );
}
