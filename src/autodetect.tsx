import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

import React from "react";
import ReactDOM from "react-dom/client";
import ADPreview from "./ADPreview.tsx";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <ADPreview />
    </React.StrictMode>,
);
