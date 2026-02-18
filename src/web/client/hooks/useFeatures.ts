import { useState, useEffect, useCallback } from "react";

interface Features {
	cartoon: boolean;
	version: string;
	enabledPlugins: string[];
}

export function useFeatures(): Features & { refresh: () => void } {
	const [features, setFeatures] = useState<Features>({ cartoon: false, version: "", enabledPlugins: [] });

	const refresh = useCallback(() => {
		fetch("/api/features")
			.then((r) => r.json())
			.then((data) => setFeatures(data as Features))
			.catch(() => {});
	}, []);

	useEffect(() => { refresh(); }, [refresh]);

	return { ...features, refresh };
}
