import { useState, useEffect } from "react";

interface Features {
	cartoon: boolean;
	version: string;
	enabledPlugins: string[];
}

export function useFeatures(): Features {
	const [features, setFeatures] = useState<Features>({ cartoon: false, version: "", enabledPlugins: [] });

	useEffect(() => {
		fetch("/api/features")
			.then((r) => r.json())
			.then((data) => setFeatures(data as Features))
			.catch(() => {});
	}, []);

	return features;
}
