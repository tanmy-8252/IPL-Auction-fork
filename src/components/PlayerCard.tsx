/* eslint-disable @next/next/no-img-element */
import type { Player } from "@/types/player";

interface PlayerCardProps {
  player: Player;
  className?: string;
}

const statusStyles: Record<string, string> = {
  bidding: "bg-[#173441] text-[#f5f7f8] border-[#2f596b]",
  sold: "bg-[#d4af37] text-[#101820] border-[#a88a2a]",
  unsold: "bg-[#2a1718] text-[#ffcdc8] border-[#7a2d30]",
};

const formatLakhs = (amount: number): string => {
  if (!amount) return "Rs 0 L";
  if (amount >= 100) {
    return `Rs ${(amount / 100).toFixed(amount % 100 === 0 ? 1 : 2)} Cr`;
  }
  return `Rs ${amount} L`;
};

const formatMetric = (value: number | undefined): string =>
  value !== undefined ? value.toFixed(1) : "N/A";

export default function PlayerCard({ player, className = "" }: PlayerCardProps) {
  const currentBidLabel = player.currentBidLakhs === 0 ? "No bids yet" : formatLakhs(player.currentBidLakhs);
  const lotNumber = player.slNo;

  const displayImage =
    player.imageUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=12303A&color=fff&size=512&bold=true`;

  return (
    <article
      className={`relative overflow-hidden border border-[#2b4550] bg-[#0f1a20] text-[#ffffff] shadow-[0_22px_70px_rgba(0,0,0,0.42)] ${className}`}
      style={{ clipPath: "polygon(2% 0, 100% 0, 98% 100%, 0 100%)" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.2),transparent_28%),linear-gradient(135deg,rgba(18,48,58,0.45),transparent_48%),linear-gradient(180deg,rgba(16,28,35,0.92),rgba(12,22,27,0.98))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r from-[#12303a] via-[#d4af37] to-[#12303a]" />

      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:gap-10 lg:p-10">
        <div className="grid gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <span className="inline-flex items-center border border-[#36525e] bg-[#12212b] px-4 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-[#e6c766]">
                {lotNumber !== null ? `Lot #${String(lotNumber).padStart(2, "0")}` : "Live Lot"}
              </span>
              <span className="inline-flex items-center justify-center border border-[#244a58] bg-[#17313d] px-3 py-1 text-[0.65rem] font-bold uppercase tracking-widest text-[#d4e7ef]">
                {player.category === "Overseas" ? "Overseas" : "Domestic"}
              </span>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-4 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.28em] ${statusStyles[player.status] || statusStyles.unsold}`}
            >
              {player.status}
            </span>
          </div>

          <div className="relative mx-auto flex aspect-4/5 w-full max-w-[320px] items-end justify-center overflow-hidden border border-[#375363] bg-[linear-gradient(180deg,#18313d_0%,#10232d_100%)] shadow-[inset_0_1px_0_rgba(230,199,102,0.18)]">
            <div className="absolute inset-x-6 top-5 h-px bg-linear-to-r from-transparent via-[#d4af37]/45 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.35)_100%)]" />
            <img
              src={displayImage}
              alt={player.name}
              className="h-[92%] w-[92%] object-contain drop-shadow-[0_22px_30px_rgba(0,0,0,0.42)]"
            />
          </div>

          <div className="border border-[#355364] bg-[#11212b] p-5 shadow-[inset_0_1px_0_rgba(230,199,102,0.16)]">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.34em] text-[#e6c766]">Vital Statistics</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="border border-[#2d4d5f] bg-[#18313d] px-4 py-3">
                <p className="text-[0.68rem] uppercase tracking-[0.28em] text-[#9eb0b8]">Matches</p>
                <p className="mt-1 font-display text-2xl">{player.stats.matches}</p>
              </div>
              <div className="border border-[#2d4d5f] bg-[#18313d] px-4 py-3">
                <p className="text-[0.68rem] uppercase tracking-[0.28em] text-[#9eb0b8]">H.S.</p>
                <p className="mt-1 font-display text-2xl">{player.stats.highestScore || "N/A"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-[0.42em] text-[#e6c766]">{player.role}</p>
              <p className="text-[0.7rem] font-bold tracking-widest text-[#9aabb4]">{player.country}</p>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <h1 className="font-display text-4xl leading-none sm:text-5xl lg:text-[4rem]">{player.name}</h1>
              <div className="h-px min-w-24 flex-1 bg-linear-to-r from-[#d4af37] via-[#244656] to-transparent" />
            </div>

            <p className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-[#9eb0b8]">
              Former: <span className="text-[#ffffff]">{player.teams || "N/A"}</span>
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="border border-[#355463] bg-[#12303a] p-6 text-[#fdfdfd] shadow-[0_20px_40px_rgba(0,0,0,0.28)]">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.36em] text-[#e6c766]">Base Price</p>
              <p className="mt-4 font-display text-4xl leading-none sm:text-[3.2rem]">{formatLakhs(player.basePriceLakhs)}</p>
              <p className="mt-3 text-sm uppercase tracking-[0.22em] text-[#c6d4da]">Reserve Valuation</p>
            </section>

            <section className="border border-[#d4af37] bg-[linear-gradient(135deg,#e6c766_0%,#a88a2a_100%)] p-6 text-[#101820] shadow-[0_20px_40px_rgba(212,175,55,0.2)]">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.36em] text-[#293641]">Current Bid</p>
              <p className="mt-4 font-display text-4xl leading-none sm:text-[3.2rem]">{currentBidLabel}</p>
              <p className="mt-3 text-sm uppercase tracking-[0.22em] text-[#293641]">
                {player.currentBidLakhs === 0 ? "Waiting for Entry" : "Live High Offer"}
              </p>
            </section>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {player.stats.runs !== undefined ? (
              <div className="border border-[#2f4e5f] bg-[#172f3b] px-5 py-4">
                <p className="text-[0.68rem] uppercase tracking-[0.28em] text-[#7b8f99]">Runs</p>
                <p className="mt-2 font-display text-3xl leading-none">{player.stats.runs}</p>
              </div>
            ) : null}

            {player.stats.wickets !== undefined && player.stats.wickets > 0 ? (
              <div className="border border-[#2f4e5f] bg-[#172f3b] px-5 py-4">
                <p className="text-[0.68rem] uppercase tracking-[0.28em] text-[#7b8f99]">Wickets</p>
                <p className="mt-2 font-display text-3xl leading-none">{player.stats.wickets}</p>
              </div>
            ) : null}

            <div className="border border-[#2f4e5f] bg-[#172f3b] px-5 py-4">
              <p className="text-[0.68rem] uppercase tracking-[0.28em] text-[#7b8f99]">Average</p>
              <p className="mt-2 font-display text-3xl leading-none">{formatMetric(player.stats.average)}</p>
            </div>

            <div className="border border-[#2f4e5f] bg-[#172f3b] px-5 py-4">
              <p className="text-[0.68rem] uppercase tracking-[0.28em] text-[#7b8f99]">S.R.</p>
              <p className="mt-2 font-display text-3xl leading-none">{formatMetric(player.stats.strikeRate)}</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
