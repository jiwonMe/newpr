import { useState, useEffect } from "react";

export interface OutdatedInfo {
	outdated: boolean;
	currentTitle?: string;
	currentState?: string;
	analyzedAt?: string;
	currentUpdatedAt?: string;
}

export function useOutdatedCheck(sessionId?: string | null): OutdatedInfo | null {
	const [info, setInfo] = useState<OutdatedInfo | null>(null);

	useEffect(() => {
		setInfo(null);
		if (!sessionId) return;
		fetch(`/api/sessions/${sessionId}/outdated`)
			.then((r) => r.json())
			.then((data) => {
				const d = data as {
					outdated?: boolean;
					current_title?: string;
					current_state?: string;
					analyzed_at?: string;
					current_updated_at?: string;
				};
				if (d.outdated !== undefined) {
					setInfo({
						outdated: d.outdated,
						currentTitle: d.current_title,
						currentState: d.current_state,
						analyzedAt: d.analyzed_at,
						currentUpdatedAt: d.current_updated_at,
					});
				}
			})
			.catch(() => {});
	}, [sessionId]);

	return info;
}
