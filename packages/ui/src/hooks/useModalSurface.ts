import { useEffect, useRef, type RefObject } from "react";

type Surface = { element: HTMLElement; close: () => void };
type BackgroundState = { inert: boolean; ariaHidden: string | null };
const surfaces: Surface[] = [];
const background = new Map<HTMLElement, BackgroundState>();
let originalOverflow = "";

function restoreBackground() {
  for (const [element, state] of background) {
    element.inert = state.inert;
    element.toggleAttribute("inert", state.inert);
    if (state.ariaHidden === null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", state.ariaHidden);
  }
}

function isolateTopSurface() {
  restoreBackground();
  const top = surfaces.at(-1);
  if (!top) { background.clear(); return; }
  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (!background.has(child)) background.set(child, {
      inert: child.hasAttribute("inert"), ariaHidden: child.getAttribute("aria-hidden"),
    });
    if (child.contains(top.element)) continue;
    child.inert = true;
    child.setAttribute("inert", "");
    child.setAttribute("aria-hidden", "true");
  }
}

function isVisible(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || node.hasAttribute("inert")) return false;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

function focusableElements(element: HTMLElement): HTMLElement[] {
  return Array.from(element.querySelectorAll<HTMLElement>(
    'a[href],button,input,select,textarea,[contenteditable="true"],[tabindex]'
  )).filter(node => !node.matches(':disabled,input[type="hidden"]') && node.tabIndex >= 0 && isVisible(node));
}

function handleKeyDown(event: KeyboardEvent) {
  const top = surfaces.at(-1);
  if (!top || event.defaultPrevented || event.isComposing) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    top.close();
  } else if (event.key === "Tab") {
    const elements = focusableElements(top.element);
    const first = elements[0];
    const last = elements.at(-1);
    if (!first || !last) { event.preventDefault(); top.element.focus(); return; }
    const current = document.activeElement;
    if (!top.element.contains(current) || current === top.element) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && current === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault(); first.focus();
    }
  }
}

/** Shared modal lifecycle: only the top surface handles keys, background is inert, focus returns on close. */
export function useModalSurface(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  // Capture before portal children can autofocus during commit.
  const focusBeforeRender = typeof document === "undefined" ? null : document.activeElement;
  useEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const previous = focusBeforeRender instanceof HTMLElement && !element.contains(focusBeforeRender) ? focusBeforeRender : null;
    const surface: Surface = { element, close: () => closeRef.current() };
    if (surfaces.length === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeyDown);
    }
    surfaces.push(surface);
    if (!element.contains(document.activeElement)) {
      const elements = focusableElements(element);
      (elements.find(node => node.matches("input,select,textarea")) || elements[0] || element).focus();
    }
    isolateTopSurface();
    return () => {
      const wasTop = surfaces.at(-1) === surface;
      const index = surfaces.indexOf(surface);
      if (index >= 0) surfaces.splice(index, 1);
      isolateTopSurface();
      if (surfaces.length === 0) {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = originalOverflow;
      }
      if (wasTop && previous?.isConnected && !previous.closest("[inert]")) previous.focus();
    };
    // Capture the opener once for each open transition, not on edits inside the surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref]);
}
