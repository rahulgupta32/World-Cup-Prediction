"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RealTimePoll() {
  const router = useRouter();

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (interval) return;

      interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          router.refresh();
        }
      }, 5000);
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  return null;
}
