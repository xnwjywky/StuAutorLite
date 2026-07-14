"""Classification algorithms package."""
from .knn import KNN
from .decision_tree import DecisionTree
from .random_classifier import RandomClassifier
from .runner import ClassificationExperimentRunner

CLASSIFIERS = {
    "KNN": KNN,
    "DECISION_TREE": DecisionTree,
    "RANDOM": RandomClassifier,
}
