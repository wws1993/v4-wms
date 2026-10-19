<script setup lang="ts">
withDefaults(defineProps<{
  kicker?: string
  title?: string
  hint?: string
  /** cockpit 用驾驶舱金；theme 跟随当前页面主题色。 */
  tone?: 'cockpit' | 'theme'
}>(), {
  kicker: 'SYS // YARD-MAP',
  title: '仓库示意图加载中',
  hint: '读取已保存园区布局',
  tone: 'cockpit',
})
</script>

<template>
  <div class="yard-load" :class="tone" role="status" aria-live="polite" :aria-label="title">
    <div class="vignette" />
    <div class="grid" />
    <div class="scan" />
    <div class="frame">
      <span class="corner tl" />
      <span class="corner tr" />
      <span class="corner bl" />
      <span class="corner br" />
      <div class="radar" aria-hidden="true">
        <div class="ring" />
        <div class="sweep" />
        <div class="core" />
      </div>
      <div class="copy">
        <span class="kicker">{{ kicker }}</span>
        <strong>{{ title }}</strong>
        <div class="ticks" aria-hidden="true">
          <i v-for="n in 8" :key="n" />
        </div>
        <em>{{ hint }}</em>
      </div>
    </div>
  </div>
</template>

<style scoped>
.yard-load {
  --accent: #e7c98a;
  --accent-hot: #f0d090;
  --accent-soft: color-mix(in srgb, var(--accent) 16%, transparent);
  --ink: #0b1018;
  --copy: #f4ead4;
  --kicker: #b7a88a;
  --hint: #c9b896;
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ink);
  cursor: default;
}
.yard-load.theme {
  --accent: var(--el-color-primary);
  --accent-hot: color-mix(in srgb, var(--el-color-primary) 72%, #fff6e4);
  --accent-soft: color-mix(in srgb, var(--el-color-primary) 16%, transparent);
  --ink: #ffffff;
  --copy: #1a2332;
  --kicker: color-mix(in srgb, var(--el-color-primary) 78%, #1a2332);
  --hint: #5a6a7e;
}
.yard-load.theme .vignette {
  background:
    radial-gradient(ellipse 70% 60% at 50% 45%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 62%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.35), transparent 24%, transparent 76%, rgba(255, 255, 255, 0.5));
}
.yard-load.theme .grid {
  background-image:
    linear-gradient(color-mix(in srgb, var(--accent) 20%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 20%, transparent) 1px, transparent 1px);
  mask-image: none;
}
.yard-load.theme .frame {
  background: rgba(255, 255, 255, 0.9);
}
.vignette,
.grid,
.scan { position: absolute; pointer-events: none; }
.vignette {
  inset: 0;
  background:
    radial-gradient(ellipse 70% 60% at 50% 45%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 58%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.35), transparent 28%, transparent 72%, rgba(0, 0, 0, 0.45));
}
.grid {
  inset: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--accent) 8%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 8%, transparent) 1px, transparent 1px);
  background-size: 28px 28px;
  animation: yardLoadGrid 12s linear infinite;
}
.scan {
  left: 0;
  right: 0;
  height: 38%;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--accent) 22%, transparent), transparent);
  animation: yardLoadScan 2.4s linear infinite;
}
.frame {
  position: relative;
  z-index: 1;
  width: min(420px, 78%);
  padding: 28px 24px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  background: color-mix(in srgb, var(--ink) 78%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 34%, transparent);
  box-shadow: 0 0 28px color-mix(in srgb, var(--accent) 12%, transparent), inset 0 0 24px color-mix(in srgb, var(--accent) 5%, transparent);
}
.corner {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid var(--accent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 55%, transparent);
}
.tl { top: -1px; left: -1px; border-right: 0; border-bottom: 0; }
.tr { top: -1px; right: -1px; border-left: 0; border-bottom: 0; }
.bl { bottom: -1px; left: -1px; border-right: 0; border-top: 0; }
.br { bottom: -1px; right: -1px; border-left: 0; border-top: 0; }
.radar {
  position: relative;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 22%, transparent) 0 6px, transparent 7px),
    repeating-radial-gradient(circle at 50% 50%, transparent 0 11px, color-mix(in srgb, var(--accent) 16%, transparent) 12px 13px);
  box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 28%, transparent);
}
.ring,
.sweep,
.core { position: absolute; border-radius: 50%; }
.ring {
  inset: 6px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-top-color: var(--accent);
  animation: yardLoadSpin 1.4s linear infinite;
}
.sweep {
  inset: 10px;
  background: conic-gradient(from 0deg, transparent 0 70%, color-mix(in srgb, var(--accent-hot) 55%, transparent) 88%, transparent 100%);
  animation: yardLoadSpin 2.2s linear infinite;
}
.core {
  inset: 36px;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent);
  animation: yardLoadPulse 1.2s ease-in-out infinite;
}
.copy {
  text-align: center;
  font-family: Bahnschrift, "DIN Alternate", Consolas, "Microsoft YaHei", monospace;
}
.kicker {
  display: block;
  margin-bottom: 6px;
  font-size: 10px;
  letter-spacing: 0.22em;
  color: var(--kicker);
}
.copy strong {
  display: block;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--copy);
  text-shadow: 0 0 12px color-mix(in srgb, var(--accent) 45%, transparent);
}
.copy em {
  display: block;
  margin-top: 8px;
  font-style: normal;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--hint);
}
.ticks {
  display: flex;
  gap: 4px;
  justify-content: center;
  margin-top: 12px;
}
.ticks i {
  display: block;
  width: 10px;
  height: 8px;
  clip-path: polygon(15% 0, 100% 0, 85% 100%, 0 100%);
  background: var(--accent-soft);
  animation: yardLoadTick 1.1s ease-in-out infinite;
}
.ticks i:nth-child(2) { animation-delay: 0.08s; }
.ticks i:nth-child(3) { animation-delay: 0.16s; }
.ticks i:nth-child(4) { animation-delay: 0.24s; }
.ticks i:nth-child(5) { animation-delay: 0.32s; }
.ticks i:nth-child(6) { animation-delay: 0.4s; }
.ticks i:nth-child(7) { animation-delay: 0.48s; }
.ticks i:nth-child(8) { animation-delay: 0.56s; }
@keyframes yardLoadScan {
  0% { top: -20%; opacity: 0.2; }
  40% { opacity: 0.85; }
  100% { top: 78%; opacity: 0.15; }
}
@keyframes yardLoadSpin { to { transform: rotate(360deg); } }
@keyframes yardLoadPulse {
  0%, 100% { opacity: 0.55; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}
@keyframes yardLoadTick {
  0%, 70%, 100% { background: var(--accent-soft); }
  35% { background: var(--accent-hot); box-shadow: 0 0 8px color-mix(in srgb, var(--accent-hot) 80%, transparent); }
}
@keyframes yardLoadGrid {
  0% { background-position: 0 0, 0 0; }
  100% { background-position: 0 28px, 28px 0; }
}
@media (prefers-reduced-motion: reduce) {
  .scan,
  .ring,
  .sweep,
  .core,
  .ticks i,
  .grid { animation: none; }
}
</style>
