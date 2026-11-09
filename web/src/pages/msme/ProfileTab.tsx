import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { NativeSelect } from '../../components/ui/NativeSelect';
import { TextField } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Feedback';
import { StatTile } from '../../components/ui/StatTile';
import { TitleWithInfo } from '../../components/ui/InfoTip';
import { auth } from '../../lib/auth';
import { fetchMetadata } from '../../lib/api';
import type { MetadataResponse } from '../../lib/api';
import { STORAGE_METHODS, storageOf } from '../../lib/profile';
import type { MsmeProfile, StorageMethod } from '../../lib/profile';
import { formatNumber } from '../../lib/format';
import { Row } from './shared';
import { RegionPicker } from '../../components/regional/RegionPicker';

/** Business profile: every number the recommendations depend on, editable in one place. */
export default function ProfileTab({ profile, onChange }: { profile: MsmeProfile; onChange: (p: MsmeProfile) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MsmeProfile>(profile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);

  useEffect(() => {
    fetchMetadata().then(setMetadata).catch(() => setMessage('Data master gagal dimuat.'));
  }, []);

  const storage = storageOf(profile.storage_method);
  const canBulk = storage.shelfLife >= 14;

  const save = async () => {
    setSaving(true);
    setMessage('');
    // The decay rate always follows the storage method so the two never disagree.
    const clean: MsmeProfile = {
      ...draft,
      daily_decay_rate: metadata?.storage_methods.find((s) => s.id === draft.storage_method)?.daily_decay_rate ?? STORAGE_METHODS[draft.storage_method]?.decay ?? 0.015,
      commodities: draft.commodities.length > 0 ? draft.commodities : metadata?.commodities.length ? [{ name: metadata.commodities[0].name, weekly_consumption_kg: 5 }] : [],
    };
    try {
      await auth.fetchAuth('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          business_name: clean.business_name,
          fnb_category: clean.fnb_category,
          reference_market: clean.reference_market,
          region_id: clean.region_id,
          commodities: clean.commodities,
          storage_method: clean.storage_method,
        }),
      });
      onChange({ ...clean, region_name: undefined });
      setEditing(false);
      setMessage('Perubahan tersimpan. Seluruh rekomendasi dihitung ulang.');
    } catch (err) {
      setMessage(`Gagal menyimpan: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleCommodity = (name: string) =>
    setDraft((d) => ({
      ...d,
      commodities: d.commodities.some((x) => x.name === name) ? d.commodities.filter((x) => x.name !== name) : [...d.commodities, { name, weekly_consumption_kg: 5 }],
    }));

  if (!editing) {
    return (
      <div className="space-y-6">
        {message && <Notice>{message}</Notice>}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Identitas usaha"
              actions={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraft(profile);
                    setMessage('');
                    setEditing(true);
                  }}
                >
                  <Pencil className="h-4 w-4" /> Ubah data
                </Button>
              }
            />
            <CardBody>
              <dl className="divide-y divide-line">
                <Row label="Nama usaha" value={profile.business_name} />
                <Row label="Kategori F&B" value={profile.fnb_category} />
                <Row label="Pasar acuan" value={profile.reference_market} />
                <Row label="Lokasi harga" value={profile.region_name ?? profile.region_id} info="Harga dan perkiraan di seluruh menu memakai data kabupaten/kota ini." />
              </dl>
            </CardBody>
          </Card>
          <StatTile
            label="Cara simpan"
            value={`${storage.icon} ${storage.short}`}
            verdict={canBulk ? { label: 'Bisa borong', tone: 'good' } : { label: 'Belum bisa borong', tone: 'warning' }}
            hint={`Susut ${formatNumber(profile.daily_decay_rate * 100, 1)}% per hari · tahan ${storage.shelfLife} hari`}
            action={canBulk ? 'Rekomendasi boleh menyarankan borong 2 minggu.' : 'Pakai chiller agar bisa borong 2 minggu saat harga naik.'}
            info="Susut adalah bobot bahan yang hilang tiap hari. Borong 2 minggu hanya dinilai bila bahan tahan disimpan minimal 14 hari."
          />
        </div>
        <Card>
          <CardHeader title={<TitleWithInfo text={`${profile.commodities.length} bahan rutin`} info="Jumlah pakai per minggu menentukan berapa kg yang disarankan untuk dibeli." />} />
          <CardBody>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {profile.commodities.map((c) => (
                <li key={c.name} className="rounded-xl bg-surface-muted px-4 py-3">
                  <span className="block text-sm font-semibold text-ink">{c.name}</span>
                  <span className="block text-sm text-ink-2">{c.weekly_consumption_kg.toLocaleString('id-ID')} kg/minggu</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader title="Perbarui data usaha" subtitle="Rekomendasi dihitung ulang setelah disimpan." />
      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Nama usaha" value={draft.business_name} onChange={(e) => setDraft({ ...draft, business_name: e.target.value })} />
          <NativeSelect label="Kategori F&B" value={draft.fnb_category} onChange={(v) => setDraft({ ...draft, fnb_category: v })} options={(metadata?.categories ?? []).map((c) => ({ value: c.name, label: c.name }))} />
          <NativeSelect label="Pasar acuan" value={draft.reference_market} onChange={(v) => setDraft({ ...draft, reference_market: v })} options={(metadata?.markets ?? []).map((m) => ({ value: m.name, label: m.name }))} />
        </div>
        <RegionPicker value={draft.region_id} onChange={(id) => setDraft((d) => ({ ...d, region_id: id }))} label="Lokasi harga (kabupaten/kota)" />
        <NativeSelect
          label="Metode simpan"
          value={draft.storage_method}
          onChange={(v) => setDraft({ ...draft, storage_method: v as StorageMethod })}
          options={(Object.keys(STORAGE_METHODS) as StorageMethod[]).map((k) => ({ value: k, label: STORAGE_METHODS[k].formLabel }))}
        />
        <fieldset>
          <legend className="text-xs font-semibold text-ink-2">Komoditas rutin & pemakaian mingguan</legend>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {(metadata?.commodities ?? []).map((c) => {
              const picked = draft.commodities.find((x) => x.name === c.name);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
                    <input type="checkbox" checked={!!picked} onChange={() => toggleCommodity(c.name)} className="h-4 w-4 accent-[var(--color-accent)]" />
                    {c.name}
                  </label>
                  {picked && (
                    <span className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        aria-label={`Pemakaian ${c.name} per minggu (kg)`}
                        value={picked.weekly_consumption_kg}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, commodities: d.commodities.map((x) => (x.name === c.name ? { ...x, weekly_consumption_kg: Number(e.target.value) } : x)) }))
                        }
                        className="w-20 rounded-lg border border-line-strong px-2 py-1 text-right text-sm tabular-nums"
                      />
                      <span className="text-xs text-ink-3">kg/minggu</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
        {message && <Notice tone="warning">{message}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(false)}>
            Batal
          </Button>
          <Button onClick={save} disabled={saving}>
            Simpan perubahan
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
