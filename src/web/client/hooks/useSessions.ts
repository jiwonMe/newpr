import { useState, useEffect, useCallback } from "react";
import type { SessionRecord } from "../../../history/types.ts";

export function useSessions() {
	const [sessions, setSessions] = useState<SessionRecord[]>([]);

	const refresh = useCallback(() => {
		fetch("/api/sessions")
			.then((r) => r.json())
			.then((data) => setSessions(data as SessionRecord[]))
			.catch(() => {});
	}, []);

	useEffect(() => { refresh(); }, [refresh]);

	return { sessions, refresh };
}
