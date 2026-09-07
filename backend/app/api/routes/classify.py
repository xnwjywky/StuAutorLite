"""图像分类实验 API — 设计文档 §16.2"""
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession
from app.models.database import get_db, ClassifyRun, Session as SessionModel
from app.models.schemas import ClassifyRunRequest
from app.core.classification.runner import ClassificationExperimentRunner
from app.utils.pagination import paginate

router = APIRouter(prefix="/classify", tags=["classification"])
runner = ClassificationExperimentRunner()


@router.post("/run")
def run_classify_experiment(req: ClassifyRunRequest, db: DbSession = Depends(get_db)):
    # 输入界限保护，防止资源滥用
    n_samples = max(20, min(req.settings.get("n_samples", 200), 1000))
    num_trials = max(1, min(req.settings.get("num_trials", 5), 20))
    max_depth = max(1, min(req.settings.get("max_depth", 4), 10))
    config = {
        "classifiers": req.classifiers,
        "n_samples": n_samples,
        "noise_levels": [max(0.0, min(n, 0.5)) for n in req.settings.get("noise_levels", [0.0])],
        "patterns": req.settings.get("patterns", ["blobs"]),
        "num_trials": num_trials,
        "train_ratio": max(0.3, min(req.settings.get("train_ratio", 0.7), 0.9)),
        "k_value": max(1, min(req.settings.get("k_value", 3), 15)),
        "max_depth": max_depth,
        "seed": req.settings.get("seed", 42),
    }
    batch_id = str(uuid.uuid4())[:8]
    try:
        result = runner.run(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"分类实验运行失败: {str(e)}")

    # Persist each run
    for r in result["runs"]:
        cr = ClassifyRun(
            session_id=req.session_id,
            batch_id=batch_id,
            classifier=r["classifier"],
            n_samples=r["n_samples"],
            noise_level=r["noise_level"],
            pattern=r["pattern"],
            trial=r["trial"],
            seed=r["seed"],
            accuracy=r["accuracy"],
            precision_data=json.dumps(r["precision"]),
            recall_data=json.dumps(r["recall"]),
            f1_data=json.dumps(r["f1"]),
            runtime_ms=r["runtime_ms"],
            points_data=json.dumps(r.get("points", [])),
            labels_data=json.dumps(r.get("labels", [])),
            predictions_data=json.dumps(r.get("predictions", [])),
            boundary_data=json.dumps(r.get("boundary_data", {})),
        )
        db.add(cr)

    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s:
        s.current_stage = "EXPERIMENT_RUNNING"
    db.commit()

    return {
        "experiment_batch_id": batch_id,
        "status": result["status"],
        "summary": result["summary"],
        "total_runs": result["total_runs"],
        "runs": result["runs"],
    }


@router.get("/runs")
def list_classify_runs(session_id: int | None = None, include_data: bool = False,
                       limit: int = 50, offset: int = 0, db: DbSession = Depends(get_db)):
    """列表接口分页 + 裁剪（P-性能）：默认不携带 points/labels/predictions/boundary_data
    大字段（除非 include_data=true），limit/offset 分页（默认 50 条/页，上限 200）。"""
    q = db.query(ClassifyRun)
    if session_id:
        q = q.filter(ClassifyRun.session_id == session_id)
    return paginate(
        q.order_by(ClassifyRun.id.desc()), limit, offset,
        lambda r: _run_to_dict(r, include_data=include_data),
    )


def _run_to_dict(r: ClassifyRun, include_data: bool = False) -> dict:
    d = {
        "id": r.id,
        "session_id": r.session_id,
        "batch_id": r.batch_id,
        "classifier": r.classifier,
        "n_samples": r.n_samples,
        "noise_level": r.noise_level,
        "pattern": r.pattern,
        "trial": r.trial,
        "seed": r.seed,
        "accuracy": r.accuracy,
        # 各分类器在噪声梯度上的性能曲线（相对小），始终返回
        "precision": json.loads(r.precision_data) if r.precision_data else [],
        "recall": json.loads(r.recall_data) if r.recall_data else [],
        "f1": json.loads(r.f1_data) if r.f1_data else [],
        "runtime_ms": r.runtime_ms,
        "created_at": str(r.created_at) if r.created_at else None,
    }
    if include_data:
        d["points"] = json.loads(r.points_data) if r.points_data else []
        d["labels"] = json.loads(r.labels_data) if r.labels_data else []
        d["predictions"] = json.loads(r.predictions_data) if r.predictions_data else []
        d["boundary_data"] = json.loads(r.boundary_data) if r.boundary_data else {}
    return d
