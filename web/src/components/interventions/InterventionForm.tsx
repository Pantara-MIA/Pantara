import { useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { NativeSelect } from '../ui/NativeSelect';
import { TextArea, TextField } from '../ui/Field';
import { StatusBadge } from '../ui/Badge';
import { Notice } from '../ui/Feedback';
import { INTERVENTION_TYPES, gov } from '../../lib/interventions';
import type { Intervention, InterventionInput, InterventionType } from '../../lib/interventions';
import { fetchPrices } from '../../lib/regional';
import type { Region, RegionalCommodity } from '../../lib/regional';
import { commodityGroups } from '../../lib/scorecard';
import { addDays, formatDate, formatIDR, formatPct } from '../../lib/format';
import { useApi } from '../../lib/useApi';

const VOLUME_UNITS = ['ton', 'kg', 'liter', 'paket'];

/** Prefill for a new intervention; any other field may be suggested too (e.g. by the planner). */
export type InterventionDraft = Pick<InterventionInput, 'region_id' | 'commodity_id' | 'baseline_date'> & Partial<InterventionInput>;

function initialInput(source: Intervention | InterventionDraft): InterventionInput {
  if ('id' in source) {
    const { region_id, commodity_id, type, title, description, start_date, end_date, volume, volume_unit, budget_idr, baseline_date } = source;
    return { region_id, commodity_id, type, title, description, start_date, end_date, volume, volume_unit, budget_idr, baseline_date };
  }
  return {
    type: 'market_operation',
    title: '',
    description: '',
    start_date: addDays(source.baseline_date, 1),
    end_date: addDays(source.baseline_date, 7),
    volume: null,
    volume_unit: 'ton',
    budget_idr: null,
    ...source,
  };
}

const toNumber = (s: string) => {
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return s.trim() === '' || Number.isNaN(n) ? null : n;
};

/**
 * Create or edit a draft intervention; the server freezes the forecast snapshot
 * on save. Mount with a `key` per source so the fields reset between uses.
 */
export function InterventionForm({
  open,
  onClose,
  source,
  regions,
  commodities,
  dateRange,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Existing draft to edit, or a prefill for a new one. */
  source: Intervention | InterventionDraft;
  regions: Region[];
  commodities: RegionalCommodity[];
  dateRange: { start: string; end: string };
  onSaved: (it: Intervention) => void;
}) {
  const [input, setInput] = useState<InterventionInput>(() => initialInput(source));
  const [volumeText, setVolumeText] = useState(input.volume?.toString() ?? '');
  const [budgetText, setBudgetText] = useState(input.budget_idr?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editing = 'id' in source;

  const set = <K extends keyof InterventionInput>(k: K, v: InterventionInput[K]) => setInput((s) => ({ ...s, [k]: v }));

  const preview = useApi(
    (s) => fetchPrices(input.region_id, input.commodity_id, 1, input.baseline_date, s),
    [input.region_id, input.commodity_id, input.baseline_date],
  );
  const region = regions.find((r) => r.id === input.region_id);
  const commodity = commodities.find((c) => c.id === input.commodity_id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = { ...input, volume: toNumber(volumeText), budget_idr: toNumber(budgetText), volume_unit: volumeText.trim() ? input.volume_unit : '' };
    try {
      const saved = editing ? await gov.update((source as Intervention).id, payload) : await gov.create(payload);
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const formId = 'intervention-form';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Ubah draf intervensi' : 'Catat intervensi'}
      description="Disimpan sebagai draf. Publik baru melihatnya setelah Anda menekan Publikasikan."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan draf
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {regions.length > 1 ? (
            <NativeSelect label="Daerah" value={input.region_id} onChange={(v) => set('region_id', v)} options={regions.map((r) => ({ value: r.id, label: r.name }))} />
          ) : (
            <TextField label="Daerah" value={region?.name ?? ''} disabled readOnly />
          )}
          <NativeSelect label="Komoditas" value={input.commodity_id} onChange={(v) => set('commodity_id', v)} groups={commodityGroups(commodities)} />
          <TextField
            label="Tanggal acuan prakiraan"
            hint="Prakiraan pada tanggal ini dibekukan sebagai pembanding evaluasi."
            type="date"
            required
            min={dateRange.start}
            max={dateRange.end}
            value={input.baseline_date}
            onChange={(e) => set('baseline_date', e.target.value)}
          />
          <NativeSelect label="Jenis intervensi" value={input.type} onChange={(v) => set('type', v as InterventionType)} options={INTERVENTION_TYPES} />
        </div>

        <div className="rounded-2xl border border-line bg-surface-muted p-3 text-sm" aria-live="polite">
          <p className="text-xs font-semibold text-ink-2">Dasar keputusan yang akan tersimpan</p>
          {preview.data ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-ink">
              {commodity?.name} di {region?.name}, {formatDate(preview.data.forecast.as_of)}: <strong>{formatIDR(preview.data.forecast.current_price)}</strong> vs acuan{' '}
              {formatIDR(preview.data.forecast.reference)}
              <StatusBadge status={preview.data.alert.status} />
              <span className="text-xs text-ink-3">peluang lampaui 14 hari {formatPct(preview.data.alert.max_breach_prob * 100, 0)}</span>
            </p>
          ) : (
            <p className="mt-1 text-ink-3">{preview.error || 'Memuat prakiraan…'}</p>
          )}
        </div>

        <TextField
          label="Judul"
          required
          maxLength={140}
          placeholder={`mis. Operasi pasar ${commodity?.name.toLowerCase() ?? ''} di pasar induk`}
          value={input.title}
          onChange={(e) => set('title', e.target.value)}
        />
        <TextArea
          label="Keterangan"
          hint="Lokasi, mitra pelaksana, harga jual, sasaran penerima — apa pun yang perlu diketahui publik."
          maxLength={4000}
          value={input.description}
          onChange={(e) => set('description', e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Mulai" type="date" required value={input.start_date} onChange={(e) => set('start_date', e.target.value)} />
          <TextField label="Selesai" type="date" required min={input.start_date} value={input.end_date} onChange={(e) => set('end_date', e.target.value)} />
          <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
            <TextField label="Volume" inputMode="decimal" placeholder="opsional" value={volumeText} onChange={(e) => setVolumeText(e.target.value)} />
            <NativeSelect label="Satuan" value={input.volume_unit || 'ton'} onChange={(v) => set('volume_unit', v)} options={VOLUME_UNITS.map((u) => ({ value: u, label: u }))} />
          </div>
          <TextField
            label="Anggaran"
            inputMode="numeric"
            placeholder="opsional"
            suffix="Rp"
            hint={toNumber(budgetText) !== null ? formatIDR(toNumber(budgetText)!) : undefined}
            value={budgetText}
            onChange={(e) => setBudgetText(e.target.value)}
          />
        </div>
        {error && <Notice tone="warning">{error}</Notice>}
      </form>
    </Dialog>
  );
}
