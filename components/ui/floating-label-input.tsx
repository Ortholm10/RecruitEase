"use client";

import { useId, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface FloatingLabelInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value"> {
  label: string;
  value: string;
  className?: string;
}

export function FloatingLabelInput({
  label,
  className,
  value,
  type = "text",
  id,
  ...props
}: FloatingLabelInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const active = isFocused || value.length > 0;

  return (
    <div className={cn("relative", className)}>
      <input
        id={inputId}
        type={type}
        value={value}
        onFocus={(e) => {
          setIsFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
        className="h-14 w-full rounded-lg border border-transparent bg-white/5 px-10 pt-5 pb-1.5 text-sm font-medium text-white outline-none transition-colors duration-300 focus:border-white/20 focus:bg-white/10"
      />
      <motion.label
        htmlFor={inputId}
        className="pointer-events-none absolute top-1/2 left-10 origin-left text-white/40"
        initial={false}
        animate={{ y: active ? "calc(-50% - 0.85rem)" : "-50%", scale: active ? 0.8 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
      >
        <span className="text-sm">{label}</span>
      </motion.label>
    </div>
  );
}
