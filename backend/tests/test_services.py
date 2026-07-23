from backend.app.services import clean_text
def test_clean_text_removes_html_urls(): assert clean_text('<b>Crash</b> https://example.com\n now')=='Crash now'
