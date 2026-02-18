import { useState, useEffect, useCallback } from "react";

interface UpdateState {
	checking: boolean;
	needsUpdate: boolean;
	current: string;
	latest: string;
	updating: boolean;
	restarting: boolean;
	error: string | null;
}

async function waitForServer(maxWait = 30000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < maxWait) {
		await new Promise((r) => setTimeout(r, 1000));
		try {
			const res = await fetch("/api/features", { signal: AbortSignal.timeout(2000) });
			if (res.ok) return true;
		} catch {}
	}
	return false;
}

export function useUpdateCheck() {
	const [state, setState] = useState<UpdateState>({
		checking: true,
		needsUpdate: false,
		current: "",
		latest: "",
		updating: false,
		restarting: false,
		error: null,
	});

	useEffect(() => {
		const check = () => {
			fetch("/api/update-check")
				.then((r) => r.json())
				.then((data) => {
					const d = data as { current: string; latest: string; needsUpdate: boolean };
					setState((s) => ({
						...s,
						checking: false,
						current: d.current,
						latest: d.latest,
						needsUpdate: s.restarting ? s.needsUpdate : d.needsUpdate,
					}));
				})
				.catch(() => setState((s) => ({ ...s, checking: false })));
		};
		check();
		const interval = setInterval(check, 60 * 60 * 1000);
		return () => clearInterval(interval);
	}, []);

	const doUpdate = useCallback(async () => {
		setState((s) => ({ ...s, updating: true, error: null }));
		try {
			const res = await fetch("/api/update", { method: "POST" });
			const data = await res.json() as { ok: boolean; restarting?: boolean; error?: string };
			if (!data.ok) {
				setState((s) => ({ ...s, updating: false, error: data.error ?? "Update failed" }));
				return;
			}

			if (data.restarting) {
				setState((s) => ({ ...s, updating: false, restarting: true }));
				const up = await waitForServer();
				if (up) {
					window.location.reload();
				} else {
					setState((s) => ({ ...s, restarting: false, error: "Server did not come back up. Try restarting manually." }));
				}
			}
		} catch (err) {
			setState((s) => ({ ...s, updating: false, error: err instanceof Error ? err.message : String(err) }));
		}
	}, []);

	return { ...state, doUpdate };
}
