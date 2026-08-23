"use client";

import { useEffect, useRef } from "react";
import { markOpenedAction } from "@/lib/actions";

// Marks an item read when it is first shown. It stays mounted while the item is on screen and
// runs once per item, so pressing "Mark unread" afterwards sticks.
export function MarkOpened({ id, unread }: { id: string; unread: boolean }) {
  const unreadAtOpen = useRef(unread);
  useEffect(() => {
    if (unreadAtOpen.current) markOpenedAction(id).catch(() => {});
  }, [id]);
  return null;
}
