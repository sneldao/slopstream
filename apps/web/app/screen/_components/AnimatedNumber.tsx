"use client";

import { useEffect, useRef } from "react";
import {
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

/**
 * Smoothly counts from the previous value to the next using a spring.
 * Numbers never snap (see design-language.md "stats footer"). Renders the
 * target immediately on first mount so SSR/no-JS shows the right figure.
 */
export function AnimatedNumber({
  value,
  format,
  spring = { stiffness: 120, damping: 30, mass: 0.8 },
}: {
  value: number;
  format?: (n: number) => string;
  spring?: Parameters<typeof useSpring>[1];
}) {
  const mv = useMotionValue(value);
  const sv = useSpring(mv, spring);
  const text = useTransform(sv, (v) =>
    format ? format(v) : Math.round(v).toLocaleString(),
  );
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    mv.set(value);
  }, [mv, value]);

  useEffect(() => {
    return subscribeText(text, ref);
  }, [text]);

  return (
    <span ref={ref} className="slop-figures">
      {format ? format(value) : value.toLocaleString()}
    </span>
  );
}

function subscribeText(
  mv: MotionValue<string>,
  ref: React.RefObject<HTMLSpanElement | null>,
) {
  return mv.on("change", (v) => {
    if (ref.current) ref.current.textContent = v;
  });
}
