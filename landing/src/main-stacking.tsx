import React from "react";
import { createRoot } from "react-dom/client";
import { StackingArticlePage } from "./StackingArticlePage.tsx";

createRoot(document.getElementById("root")!).render(<StackingArticlePage locale="en" />);
