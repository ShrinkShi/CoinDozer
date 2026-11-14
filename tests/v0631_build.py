"""Regression tests for strict zero-dependency build template contract."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build import BuildError, inline_assets, STYLE_TAG, SCRIPT_TAG

class BuildContractTest(unittest.TestCase):
    def setUp(self):
        self.template = '<html><head>' + STYLE_TAG + '</head><body>' + SCRIPT_TAG + '</body></html>'

    def test_success_inlines_both_assets(self):
        result=inline_assets(self.template, 'body{color:white}', 'const game=1;')
        self.assertIn('body{color:white}',result)
        self.assertIn('const game=1;',result)
        self.assertNotIn(STYLE_TAG,result)
        self.assertNotIn(SCRIPT_TAG,result)

    def test_tag_spacing_drift_fails(self):
        altered=self.template.replace('href="./style.css" />','href="./style.css"/>')
        with self.assertRaisesRegex(BuildError,'CSS: expected exactly one'):
            inline_assets(altered,'body{}','const x=1;')

    def test_script_attribute_drift_fails(self):
        altered=self.template.replace('type="module" src=', 'src=')
        with self.assertRaisesRegex(BuildError,'entry script: expected exactly one'):
            inline_assets(altered,'body{}','const x=1;')

    def test_duplicate_tag_fails(self):
        with self.assertRaisesRegex(BuildError,'expected exactly one'):
            inline_assets(self.template+STYLE_TAG,'body{}','const x=1;')

    def test_residual_external_dependency_fails(self):
        altered=self.template.replace('</head>', '<script src="./extra.js"></script></head>')
        with self.assertRaisesRegex(BuildError,'dependent script'):
            inline_assets(altered,'body{}','const x=1;')

if __name__ == '__main__':
    unittest.main(verbosity=2)
