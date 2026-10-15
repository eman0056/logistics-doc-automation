import os
import ast
import json
import unittest


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_status_function(source_path, helper_names):
    with open(os.path.join(PROJECT_ROOT, source_path), encoding="utf-8") as source_file:
        parsed = ast.parse(source_file.read(), filename=source_path)
    selected = [
        node for node in parsed.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name in helper_names
    ]
    namespace = {"json": json}
    exec(compile(ast.Module(body=selected, type_ignores=[]), source_path, "exec"), namespace)
    return namespace["_invoice_result_status"]


class InvoiceQualityStatusTests(unittest.TestCase):
    def setUp(self):
        self.status_functions = (
            load_status_function(
                "api/index.py",
                {"_parse_invoice_json", "_has_saved_extraction_result", "_invoice_number_from_data", "_invoice_result_status"},
            ),
            load_status_function(
                "server.py",
                {"_parse_saved_invoice", "_has_saved_invoice_result", "_invoice_number_from_saved_data", "_invoice_result_status"},
            ),
        )

    def test_clear_image_with_missing_invoice_number_needs_review(self):
        invoice = {
            "invoiceHeader": {"invoiceDate": "2025-01-01"},
            "shipmentDetails": [{"description": "Freight"}],
        }
        for get_status in self.status_functions:
            with self.subTest(backend=get_status.__code__.co_filename):
                self.assertEqual(get_status(invoice, 0.9), "NEEDS_REVIEW")

    def test_low_visual_quality_with_invoice_number_is_poor_quality(self):
        invoice = {"invoiceHeader": {"invoiceNumber": "INV-123"}}
        for get_status in self.status_functions:
            with self.subTest(backend=get_status.__code__.co_filename):
                self.assertEqual(get_status(invoice, 0.59), "POOR_IMAGE_QUALITY")

    def test_incomplete_extraction_is_not_poor_quality(self):
        invoice = {"invoiceHeader": {}}
        for get_status in self.status_functions:
            with self.subTest(backend=get_status.__code__.co_filename):
                self.assertEqual(get_status(invoice, 0.9), "NEEDS_REVIEW")
                self.assertNotEqual(get_status(invoice, None), "POOR_IMAGE_QUALITY")

    def test_normal_invoice_at_existing_threshold_is_extracted(self):
        invoice = {"invoiceHeader": {"invoiceNumber": "INV-456"}}
        for get_status in self.status_functions:
            with self.subTest(backend=get_status.__code__.co_filename):
                self.assertEqual(get_status(invoice, 0.6), "EXTRACTED")


if __name__ == "__main__":
    unittest.main()
