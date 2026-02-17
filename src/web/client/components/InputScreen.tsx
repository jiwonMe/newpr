import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";

export function InputScreen({ onSubmit }: { onSubmit: (pr: string) => void }) {
	const [value, setValue] = useState("");

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = value.trim();
		if (trimmed) onSubmit(trimmed);
	}

	return (
		<div className="flex flex-col items-center gap-12 py-24">
			<div className="flex flex-col items-center gap-3">
				<h1 className="text-4xl font-bold tracking-tight">newpr</h1>
				<p className="text-muted-foreground text-center max-w-md">
					AI-powered PR review tool. Paste a PR URL to get a comprehensive analysis.
				</p>
			</div>

			<form onSubmit={handleSubmit} className="w-full max-w-xl">
				<div className="flex gap-2">
					<input
						type="text"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder="https://github.com/owner/repo/pull/123"
						className="flex-1 h-11 rounded-lg border bg-background px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						autoFocus
					/>
					<Button type="submit" size="lg" disabled={!value.trim()}>
						Analyze
						<ArrowRight className="ml-2 h-4 w-4" />
					</Button>
				</div>
			</form>
		</div>
	);
}
