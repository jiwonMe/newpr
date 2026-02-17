import { useState, useEffect } from "react";

export interface GithubUser {
	login: string;
	avatar_url: string;
	html_url: string;
	name: string | null;
}

export function useGithubUser() {
	const [user, setUser] = useState<GithubUser | null>(null);

	useEffect(() => {
		fetch("/api/me")
			.then((r) => r.json())
			.then((data) => {
				const d = data as Record<string, unknown>;
				if (d.login) setUser(d as unknown as GithubUser);
			})
			.catch(() => {});
	}, []);

	return user;
}
