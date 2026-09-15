/**
 * The masthead of the printed calculation report.
 *
 * Invisible on screen, first thing on paper. It exists because a printout of
 * an interface is not a document: a memoria de cálculo has to say what it is,
 * who produced it, under which institution and when — otherwise it is a set of
 * anonymous tables that a marker cannot attribute and a student cannot file.
 *
 * The name and the institutions are READ from `data/author.ts` and
 * `data/institutions.ts` rather than written here. Both modules already say,
 * in their own comments, that they exist so a credit has one source; typing
 * the author's name and university into this file would create the second copy
 * they were written to prevent, and it would be the copy nobody remembers to
 * update. This project has already changed both once.
 *
 * Only the LABELS are local — "Autora", "Perfil", "Institución" — because they
 * are about how the document addresses its reader, not about who the author is.
 */

import { useEffect, useState } from 'react';

import { flushSync } from 'react-dom';

import { AUTHOR } from '../../data/author';
import { INSTITUTIONS } from '../../data/institutions';
import { UNITS } from '../../utils/units';

export interface PrintReportHeaderProps {
  /** Name of the model being reported, when it carries one. */
  modelName?: string;
}

export function PrintReportHeader({ modelName }: PrintReportHeaderProps) {
  const generatedAt = usePrintTimestamp();

  return (
    // `hidden print:block`: absent from the accessibility tree and from the
    // layout on screen, a normal block on paper.
    <header className="hidden print:block print:break-inside-avoid">
      <div className="flex items-start justify-between gap-6 border-b-2 border-[#111111] pb-3">
        <div className="min-w-0">
          <h1 className="font-display text-[15pt] leading-tight font-bold text-[#111111]">
            Análisis Matricial de Pórticos 2D
          </h1>
          <p className="mt-1 text-[9.5pt] text-[#3f3f46]">
            Memoria de cálculo · Método de la Rigidez Directa · Análisis lineal elástico de
            primer orden
          </p>
        </div>

        {/*
          The seals, at print resolution. `.institution-logo` presents them on
          a white ground, which is exactly right on paper.

          A missing mark falls back to its initials rather than to an empty
          box, so a report printed before the logos arrive still has a
          masthead with the right proportions instead of two blank squares
          that look like a failed image load.
        */}
        <div className="flex shrink-0 items-center gap-2">
          {INSTITUTIONS.map((institution) => (
            <span
              key={institution.name}
              className="institution-logo grid size-12 place-items-center"
            >
              {institution.logo === null ? (
                <span className="font-display text-[9pt] font-bold text-[#3f3f46]">
                  {institution.initials}
                </span>
              ) : (
                <img
                  src={institution.logo}
                  alt={institution.name}
                  width={institution.intrinsicSize}
                  height={institution.intrinsicSize}
                  className="size-full object-cover"
                />
              )}
            </span>
          ))}
        </div>
      </div>

      {/*
        A definition list, not a paragraph. These are labelled fields of a
        record — the same shape a cover sheet has — and a marker reads them by
        scanning the labels down the left rather than by reading prose.
      */}
      <dl className="mt-3 grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-1 text-[9pt] text-[#111111]">
        {/*
          "Autora", in the feminine. The label is not generic boilerplate: it
          names a specific person on a document she signs, and Spanish makes
          that agreement visible. `data/author.ts` remains the single source of
          the name and the role; only the label lives here.
        */}
        <dt className="font-semibold text-[#52525b]">Autora</dt>
        <dd className="font-semibold">{AUTHOR.name}</dd>

        {/*
          A field of its own rather than a suffix on the name. On a cover sheet
          the profile is something a marker looks up by label, and appended
          after a middle dot it was findable only by reading the name first.
        */}
        <dt className="font-semibold text-[#52525b]">Perfil</dt>
        <dd>{AUTHOR.role}</dd>

        <dt className="font-semibold text-[#52525b]">Generado</dt>
        {/*
          `suppressHydrationWarning` is not needed: the timestamp starts null on
          both the server render and the first client render, and only appears
          once the effect below has run. An em dash for that one frame is
          invisible — the element is `display: none` until the print layout.
        */}
        <dd className="num">{generatedAt ?? '—'}</dd>

        <dt className="font-semibold text-[#52525b]">Institución</dt>
        <dd>{INSTITUTIONS.map((institution) => institution.name).join(' · ')}</dd>

        <dt className="font-semibold text-[#52525b]">Unidades</dt>
        <dd className="num">
          {UNITS.force} · {UNITS.length} · {UNITS.modulus} · {UNITS.area} · {UNITS.inertia}
        </dd>

        {modelName !== undefined && (
          <>
            <dt className="font-semibold text-[#52525b]">Modelo</dt>
            <dd className="col-span-3">{modelName}</dd>
          </>
        )}
      </dl>
    </header>
  );
}

/**
 * The moment the report was produced, refreshed as the print dialog opens.
 *
 * Two things force this into a hook rather than a `new Date()` in the markup.
 *
 * The page is statically rendered, so a date evaluated during render would be
 * the BUILD date on the server and today's date on the client — a hydration
 * mismatch, and a report stamped with the day the site was deployed. Starting
 * at null and filling in from an effect makes both renders agree.
 *
 * And the stamp has to be the moment of PRINTING, not of page load. A tab left
 * open overnight would otherwise date the report to yesterday, which on a
 * submitted document is not a cosmetic error. `beforeprint` fires before the
 * browser lays the page out, and `flushSync` is what guarantees React has
 * committed the new text by then — a batched update would land after the
 * snapshot the printer receives.
 */
function usePrintTimestamp(): string | null {
  const [stamp, setStamp] = useState<string | null>(null);

  useEffect(() => {
    setStamp(formatTimestamp(new Date()));

    const refresh = () => {
      flushSync(() => setStamp(formatTimestamp(new Date())));
    };

    window.addEventListener('beforeprint', refresh);
    return () => window.removeEventListener('beforeprint', refresh);
  }, []);

  return stamp;
}

/** Spanish long date plus the time, e.g. "8 de septiembre de 2026, 14:05". */
function formatTimestamp(date: Date): string {
  return date.toLocaleString('es-EC', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
