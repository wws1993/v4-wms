<script setup lang="ts">
withDefaults(defineProps<{
  color?: string
  round?: boolean
  size?: number
}>(), {
  color: '#e7c98a',
  round: false,
  size: 8,
})
</script>

<template>
  <i class="pulse-dot" :class="{ round }" :style="{ '--dot': color, '--size': `${size}px` }" />
</template>

<style scoped>
.pulse-dot {
  position: relative;
  flex: none;
  width: var(--size);
  height: var(--size);
  background: var(--dot);
  box-shadow: 0 0 6px var(--dot);
  animation: pulseBeat 1.4s ease-in-out infinite;
}
.pulse-dot.round { border-radius: 50%; }
.pulse-dot::after {
  content: "";
  position: absolute;
  inset: -4px;
  border: 1px solid var(--dot);
  animation: pulseRipple 1.4s ease-out infinite;
}
.pulse-dot.round::after { border-radius: 50%; }
@keyframes pulseBeat {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.7); opacity: 0.45; }
}
@keyframes pulseRipple {
  0% { transform: scale(0.5); opacity: 0.85; }
  100% { transform: scale(2.4); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .pulse-dot,
  .pulse-dot::after { animation: none; }
}
</style>
