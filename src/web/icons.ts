// Phosphor icons (MIT), imported as raw SVG so they take the text colour.
import arrowLeft from "@phosphor-icons/core/assets/regular/arrow-left.svg?raw";
import arrowRight from "@phosphor-icons/core/assets/regular/arrow-right.svg?raw";
import swap from "@phosphor-icons/core/assets/regular/arrows-left-right.svg?raw";
import caretDown from "@phosphor-icons/core/assets/regular/caret-down.svg?raw";
import check from "@phosphor-icons/core/assets/regular/check.svg?raw";
import clock from "@phosphor-icons/core/assets/regular/clock.svg?raw";
import download from "@phosphor-icons/core/assets/regular/download-simple.svg?raw";
import equals from "@phosphor-icons/core/assets/regular/equals.svg?raw";
import flask from "@phosphor-icons/core/assets/regular/flask.svg?raw";
import info from "@phosphor-icons/core/assets/regular/info.svg?raw";
import list from "@phosphor-icons/core/assets/regular/list-magnifying-glass.svg?raw";
import lock from "@phosphor-icons/core/assets/regular/lock-simple.svg?raw";
import search from "@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw";
import pin from "@phosphor-icons/core/assets/regular/push-pin.svg?raw";
import printer from "@phosphor-icons/core/assets/regular/printer.svg?raw";
import prohibit from "@phosphor-icons/core/assets/regular/prohibit.svg?raw";
import question from "@phosphor-icons/core/assets/regular/question.svg?raw";
import refresh from "@phosphor-icons/core/assets/regular/arrows-clockwise.svg?raw";
import star from "@phosphor-icons/core/assets/regular/star.svg?raw";
import trendDown from "@phosphor-icons/core/assets/regular/trend-down.svg?raw";
import trendUp from "@phosphor-icons/core/assets/regular/trend-up.svg?raw";
import upload from "@phosphor-icons/core/assets/regular/upload-simple.svg?raw";
import warning from "@phosphor-icons/core/assets/regular/warning.svg?raw";
import x from "@phosphor-icons/core/assets/regular/x.svg?raw";
import { h } from "./dom";

const ICONS = { arrowLeft, arrowRight, swap, caretDown, check, clock, download, equals, flask, info, list, lock, search, pin, printer, prohibit, question, refresh, star, trendDown, trendUp, upload, warning, x };
export type IconName = keyof typeof ICONS;

export function icon(name: IconName): HTMLSpanElement {
  const span = h("span", { class: "icon", "aria-hidden": "true" });
  span.innerHTML = ICONS[name];
  return span;
}
