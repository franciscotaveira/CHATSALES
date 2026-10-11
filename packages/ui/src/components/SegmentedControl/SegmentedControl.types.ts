import type { CSSProperties } from "react";

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  badge?: number | string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}

