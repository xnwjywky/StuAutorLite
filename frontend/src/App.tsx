import { Routes, Route, Navigate } from "react-router-dom";
import TaskSelect from "./pages/TaskSelect";
import ProfilePage from "./pages/ProfilePage";
import Archive from "./pages/Archive";
import AgentConfigPage from "./pages/AgentConfig";
import Workbench from "./pages/Workbench";

// 独立预览页（保留兼容）
import QuestionForm from "./pages/QuestionForm";
import HypothesisForm from "./pages/HypothesisForm";
import ExperimentDesign from "./pages/ExperimentDesign";
import ExperimentRun from "./pages/ExperimentRun";
import ResultAnalysis from "./pages/ResultAnalysis";
import Reflection from "./pages/Reflection";
import ReportView from "./pages/ReportView";
import ReviewFeedback from "./pages/ReviewFeedback";
import ClassificationWorkbench from "./pages/ClassificationWorkbench";
import GuessNumberWorkbench from "./pages/GuessNumberWorkbench";
import SortingWorkbench from "./pages/SortingWorkbench";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TaskSelect />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/archive" element={<Archive />} />
      <Route path="/agent-config" element={<AgentConfigPage />} />
      <Route path="/workbench/:sessionId" element={<Workbench />} />
      <Route path="/workbench-classify/:sessionId" element={<ClassificationWorkbench />} />
      <Route path="/workbench-guess/:sessionId" element={<GuessNumberWorkbench />} />
      <Route path="/workbench-sort/:sessionId" element={<SortingWorkbench />} />
      <Route path="/question" element={<QuestionForm />} />
      <Route path="/hypothesis" element={<HypothesisForm />} />
      <Route path="/experiment-design" element={<ExperimentDesign />} />
      <Route path="/experiment-run" element={<ExperimentRun />} />
      <Route path="/result-analysis" element={<ResultAnalysis />} />
      <Route path="/reflection" element={<Reflection />} />
      <Route path="/report" element={<ReportView />} />
      <Route path="/report/:sessionId" element={<ReportView />} />
      <Route path="/review-feedback" element={<ReviewFeedback />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
