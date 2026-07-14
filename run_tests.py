#!/usr/bin/env python3
"""
统一测试运行器 — 一键运行全部测试，错误记录至 logs/ 目录

用法:
    python run_tests.py              # 运行全部
    python run_tests.py --backend     # 仅后端
    python run_tests.py --frontend    # 仅前端
    python run_tests.py --quick       # 快速模式（跳过慢测试）
"""
import sys
import os
import subprocess
import json
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent
LOG_DIR = ROOT / "backend" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

RESULTS = {"backend": None, "frontend": None, "errors": [], "timestamp": datetime.now().isoformat()}


def log(msg: str, level: str = "INFO"):
    prefix = f"[{datetime.now().strftime('%H:%M:%S')}] [{level}]"
    line = f"{prefix} {msg}"
    print(line)
    if level in ("ERROR", "FAIL"):
        RESULTS["errors"].append(line)


def run_backend_tests(quick: bool = False):
    """运行后端 pytest 测试。"""
    log("=" * 60)
    log("开始后端测试（pytest）...")
    backend_dir = ROOT / "backend"

    # 激活 venv（如果存在）
    venv_python = backend_dir / ".venv" / "Scripts" / "python.exe"
    python_exe = str(venv_python) if venv_python.exists() else sys.executable

    args = [python_exe, "-m", "pytest", str(backend_dir / "tests"), "-v", "--tb=short",
            "--color=yes", f"--rootdir={backend_dir}"]
    if quick:
        args.extend(["-x", "--timeout=30"])

    try:
        result = subprocess.run(args, cwd=str(backend_dir), capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        log("后端测试超时（超过 300 秒）", "ERROR")
        RESULTS["backend"] = "TIMEOUT"
        return False

    output = result.stdout + result.stderr
    print(output)

    # 统计通过/失败
    passed = output.count(" passed")
    failed = output.count(" failed")
    errors = output.count(" error")

    RESULTS["backend"] = {"passed": 0, "failed": 0, "errors": 0}
    if result.returncode == 0:
        log(f"✅ 后端测试全部通过 ({passed} passed)", "INFO")
        return True
    else:
        log(f"❌ 后端测试失败: {failed} failed, {errors} errors", "ERROR")
        return False

    # 保存日志
    log_file = LOG_DIR / f"backend_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    log_file.write_text(output, encoding="utf-8")
    log(f"详细日志: {log_file}")


def run_frontend_tests(quick: bool = False):
    """运行前端 vitest 测试。"""
    log("=" * 60)
    log("开始前端测试（vitest）...")
    frontend_dir = ROOT / "frontend"

    npx_cmd = "npx.cmd" if sys.platform == "win32" else "npx"
    args = [npx_cmd, "vitest", "run", "--reporter=verbose"]
    if quick:
        args.append("--bail=1")

    try:
        result = subprocess.run(args, cwd=str(frontend_dir), capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        log("前端测试超时（超过 120 秒）", "ERROR")
        RESULTS["frontend"] = "TIMEOUT"
        return False

    output = result.stdout + result.stderr
    print(output)

    # 统计
    import re
    passed_match = re.search(r"Tests\s+(\d+)\s+passed", output)
    failed_match = re.search(r"(\d+)\s+failed", output)
    passed = int(passed_match.group(1)) if passed_match else 0
    failed = int(failed_match.group(1)) if failed_match else 999

    RESULTS["frontend"] = {"passed": passed, "failed": failed}

    if result.returncode == 0 and failed == 0:
        log(f"✅ 前端测试全部通过 ({passed} passed)", "INFO")
        return True
    else:
        log(f"❌ 前端测试失败: {failed} failed", "ERROR")
        return False

    # 保存日志
    log_file = LOG_DIR / f"frontend_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    log_file.write_text(output, encoding="utf-8")
    log(f"详细日志: {log_file}")


def print_summary(ok: bool):
    log("=" * 60)
    log("测试完成")
    log(f"后端: {RESULTS['backend']}")
    log(f"前端: {RESULTS['frontend']}")

    if RESULTS["errors"]:
        log(f"共 {len(RESULTS['errors'])} 个错误")
        for e in RESULTS["errors"]:
            print(f"  {e}")

    # 写入 JSON 报告
    report_path = LOG_DIR / f"test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    report_path.write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    log(f"测试报告: {report_path}")

    if ok:
        log("🎉 全部测试通过！", "INFO")
    else:
        log("⚠️  存在测试失败，请检查日志", "ERROR")

    return 0 if ok else 1


def main():
    import argparse
    parser = argparse.ArgumentParser(description="StuAutorLite 统一测试运行器")
    parser.add_argument("--backend", action="store_true", help="仅运行后端测试")
    parser.add_argument("--frontend", action="store_true", help="仅运行前端测试")
    parser.add_argument("--quick", action="store_true", help="快速模式（遇错即停）")
    args = parser.parse_args()

    run_both = not args.backend and not args.frontend

    start = time.time()
    backend_ok = frontend_ok = True

    if args.backend or run_both:
        backend_ok = run_backend_tests(quick=args.quick)
    if args.frontend or run_both:
        frontend_ok = run_frontend_tests(quick=args.quick)

    elapsed = time.time() - start
    log(f"总耗时: {elapsed:.1f}s")

    ok = backend_ok and frontend_ok
    sys.exit(print_summary(ok))


if __name__ == "__main__":
    main()
