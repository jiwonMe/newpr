import { useCallback, useRef } from "react";

export function ResizeHandle({
	onResize,
	side = "right",
}: {
	onResize: (delta: number) => void;
	side?: "left" | "right";
}) {
	const dragging = useRef(false);
	const startX = useRef(0);

	const onMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		dragging.current = true;
		startX.current = e.clientX;
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";

		const onMouseMove = (ev: MouseEvent) => {
			if (!dragging.current) return;
			const delta = ev.clientX - startX.current;
			startX.current = ev.clientX;
			onResize(side === "right" ? delta : -delta);
		};

		const onMouseUp = () => {
			dragging.current = false;
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};

		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	}, [onResize, side]);

	return (
		<div
			onMouseDown={onMouseDown}
			className="w-1 shrink-0 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors"
		/>
	);
}
