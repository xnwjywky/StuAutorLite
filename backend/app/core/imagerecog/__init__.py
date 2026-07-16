"""统一图像识别实验 — 图形识别 + 手写数字识别"""
from .runner import ImageRecogRunner
from .algorithms import ALGO_REGISTRY, ALGO_LABELS, SHAPE_DEFAULT_ALGOS, DIGIT_DEFAULT_ALGOS
from .data import generate_shape, generate_digit, generate_shape_dataset, generate_digit_dataset, SIZE, SHAPES
