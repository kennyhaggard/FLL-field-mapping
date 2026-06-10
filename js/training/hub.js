import { lessons } from "./lessons.js";

const lessonList = document.getElementById("training-lesson-list");

function refreshTrainingStylesheet() {
  const link = document.querySelector("link[rel='stylesheet'][href*='styles.css']");
  if (!link || link.href.includes("training-pane-2")) return;
  const baseHref = link.getAttribute("href").split("?")[0];
  link.href = `${baseHref}?v=training-pane-2`;
}

function renderLessonHub() {
  if (!lessonList) return;

  lessonList.innerHTML = "";
  lessons.forEach((lesson, index) => {
    const card = document.createElement("a");
    card.className = "training-card";
    card.href = `training/${lesson.id}.html`;

    const number = document.createElement("span");
    number.className = "training-card-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const title = document.createElement("strong");
    title.textContent = lesson.title;

    const objective = document.createElement("span");
    objective.textContent = lesson.objective;

    card.append(number, title, objective);
    lessonList.appendChild(card);
  });
}

refreshTrainingStylesheet();
renderLessonHub();
