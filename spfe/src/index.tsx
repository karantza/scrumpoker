import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import Lobby from "./Lobby";
import Room from "./Room";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <React.StrictMode>
    <div>

    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/r/:roomId" element={<Room />} />
      </Routes>
    </BrowserRouter>
    </div>
  </React.StrictMode>
);
