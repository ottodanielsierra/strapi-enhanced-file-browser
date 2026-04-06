import type { ComponentType } from "react";

let nativeMediaField: ComponentType<any> | null = null;

export const setNativeMediaField = (component: ComponentType<any> | undefined) => {
  nativeMediaField = component ?? null;
};

export const getNativeMediaField = () => nativeMediaField;
