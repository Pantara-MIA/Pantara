import { useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';
import type { Commodity } from '../data/types';
import { STORAGE_META } from '../data/types';
import { VOLATILITY_META, getStorage, priceSeries } from '../data/commodities';
import { formatIDR, formatNumber } from '../lib/format';
import CommodityArt from './CommodityArt';
import { TrendSparkline } from './charts/TrendSparkline';

/** Encyclopedia tile: illustration, volatility, reference price, trend and shelf life. */
export default function CommodityCard({ c, onOpen }: { c: Commodity; onOpen: (c: Commodity) => void }) {
  const series = useMemo(() => priceSeries(c), [c]);
  const vol = VOLATILITY_META[c.volatility];
  const best = getStorage(c, c.storage.best);
  const room = getStorage(c, 'room');
  const up = c.yoy >= 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(c)}
      aria-label={`Buka detail ${c.name}`}
      className="spotlight group flex w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-[0_10px_30px_-24px_rgba(13,51,17,0.45)] transition-[border-color,box-shadow,translate,scale,--spot] duration-300 hover:-translate-y-1 hover:border-mint hover:shadow-[0_26px_48px_-28px_rgba(13,51,17,0.65)] active:scale-[0.98]"
    >
      <div className="relative h-36 overflow-hidden">
        <CommodityArt art={c.art} photo={c.photo} alt="" className="h-full w-full transition-transform duration-500 group-hover:scale-[1.04]" />
        <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${vol.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${vol.dot}`} aria-hidden="true" />
          {vol.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-display text-lg leading-tight font-bold text-ink">{c.name}</h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-ink-3">{c.tagline}</p>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-ink">
              {formatIDR(c.price)}
              <span className="text-xs font-normal text-ink-3">/{c.unit}</span>
            </p>
            <p className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-critical-ink' : 'text-good-ink'}`}>
              {up ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
              {up ? '+' : ''}
              {formatNumber(c.yoy)}% vs tahun lalu
            </p>
          </div>
          <TrendSparkline values={series} width={96} height={30} />
        </div>

        <p className="mt-auto flex items-center gap-1.5 border-t border-line pt-3 text-xs text-ink-2">
          <Clock className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
          Suhu ruang {room.shelfLifeDays} hari · terbaik {STORAGE_META[c.storage.best].short} {best.shelfLifeDays} hari
        </p>
      </div>
    </button>
  );
}
