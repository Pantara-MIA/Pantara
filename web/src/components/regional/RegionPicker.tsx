import { useEffect, useMemo, useState } from 'react';
import { NativeSelect } from '../ui/NativeSelect';
import { NATIONAL_SCOPE, fetchRegions } from '../../lib/regional';
import { useApi } from '../../lib/useApi';

/**
 * Province → regency/city picker. `value` is a regency/city region ID; picking
 * another province selects its first regency/city.
 */
export function RegionPicker({ value, onChange, label = 'Lokasi usaha (kabupaten/kota)' }: { value: string; onChange: (id: string) => void; label?: string }) {
  const provinces = useApi((s) => fetchRegions({ scope: NATIONAL_SCOPE }, s), []);
  const home = useApi((s) => (value ? fetchRegions({ region: value }, s) : Promise.resolve(null)), [value]);
  const [picked, setPicked] = useState<string>();
  const province = picked ?? home.data?.scope.region ?? '';
  const regencies = useApi((s) => (province ? fetchRegions({ scope: province }, s) : Promise.resolve(null)), [province]);

  const list = useMemo(() => (regencies.data?.scope.id === province ? regencies.data.regions : []), [regencies.data, province]);
  useEffect(() => {
    if (list.length && !list.some((r) => r.id === value)) onChange(list[0].id);
  }, [list, value, onChange]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <NativeSelect
        label="Provinsi"
        value={province}
        onChange={setPicked}
        options={[...(province ? [] : [{ value: '', label: 'Memuat…' }]), ...(provinces.data?.regions ?? []).map((r) => ({ value: r.id, label: r.name }))]}
      />
      <NativeSelect
        label={label}
        value={list.some((r) => r.id === value) ? value : ''}
        onChange={onChange}
        options={list.length ? list.map((r) => ({ value: r.id, label: r.name })) : [{ value: '', label: 'Memuat…' }]}
      />
    </div>
  );
}
