import { FileBadge2, FileCheck, FileText, MapPin, CalendarDays, Gauge } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import UsedVehicleFormGenerator from '@/components/UsedVehicleFormGenerator';
import { useAuth } from '@/context/auth-hooks';
import { useState } from 'react';
import { ExtractedVehicleDocumentInfo } from '@/types/inventory';

const fieldRows = [
  { key: 'vin', label: 'VIN', icon: FileBadge2 },
  { key: 'purchaseDate', label: 'Purchase Date', icon: CalendarDays },
  { key: 'mileage', label: 'Mileage', icon: Gauge },
  { key: 'purchasedFrom', label: 'Obtained From', icon: FileText },
  { key: 'usedVehicleSourceAddress', label: 'Address', icon: MapPin },
];

export default function UsedVehicleForms() {
  const { token } = useAuth();
  const [extractedInfo, setExtractedInfo] = useState<ExtractedVehicleDocumentInfo | null>(null);

  return (
    <AppLayout>
      <div className="space-y-8">
        <section className="rounded-[28px] border border-zinc-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_32%),linear-gradient(135deg,_rgba(24,24,27,0.98),_rgba(9,9,11,1))] p-8 text-white shadow-2xl shadow-black/20">
          <div className="max-w-3xl space-y-4">
            <span className="inline-flex items-center rounded-full border border-profit/30 bg-profit/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-profit">
              PDF Workflow
            </span>
            <h1 className="font-display text-4xl font-bold tracking-tight">
              Generate a filled Used Vehicle Record from a CamScanner document
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-zinc-300">
              Upload the scanned source document. We&apos;ll extract the vehicle details,
              place them into the built-in Used Vehicle Record template, and download the
              completed PDF for you.
            </p>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <UsedVehicleFormGenerator
              token={token}
              onScanComplete={setExtractedInfo}
            />

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
              <h2 className="text-lg font-semibold text-white">How it works</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <StepCard
                  number="01"
                  title="Upload source"
                  description="Choose the CamScanner bill of sale or purchase PDF."
                />
                <StepCard
                  number="02"
                  title="Auto-fill blank sheet"
                  description="The built-in Used Vehicle Record form is used automatically."
                />
                <StepCard
                  number="03"
                  title="Download result"
                  description="The completed PDF downloads automatically after generation."
                />
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-profit/15 text-profit">
                <FileCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Extracted Details</h2>
                <p className="text-sm text-zinc-500">Preview of the values going into the PDF.</p>
              </div>
            </div>

            {extractedInfo ? (
              <div className="mt-5 space-y-5">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Vehicle</p>
                  <p className="mt-2 font-display text-2xl font-bold text-white">
                    {[extractedInfo.year, extractedInfo.make, extractedInfo.model].filter(Boolean).join(' ')}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {[extractedInfo.color, extractedInfo.usedVehicleSourceCity, extractedInfo.usedVehicleSourceState]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                </div>

                <div className="space-y-3">
                  {fieldRows.map(({ key, label, icon: Icon }) => {
                    const value = formatFieldValue(key, extractedInfo);
                    return (
                      <div
                        key={key}
                        className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
                      >
                        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</p>
                          <p className="mt-1 break-words text-sm font-medium text-white">
                            {value || 'Not detected'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-6 text-sm leading-6 text-zinc-500">
                Generate a form once and the extracted vehicle information will appear here so
                you can quickly verify the filled values.
              </div>
            )}
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-profit">{number}</p>
      <h3 className="mt-3 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
    </div>
  );
}

function formatFieldValue(
  key: string,
  info: ExtractedVehicleDocumentInfo
) {
  const value = info[key as keyof ExtractedVehicleDocumentInfo];

  if (!value && value !== 0) {
    return '';
  }

  if (key === 'purchaseDate' && typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  if (key === 'mileage' && typeof value === 'number') {
    return `${value.toLocaleString()} mi`;
  }

  return String(value);
}
