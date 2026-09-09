from assistant import Assistant


def test_greeting():
    reply = Assistant().reply("hello")
    assert reply.intent == "greeting"


def test_reverse():
    reply = Assistant().reply("reverse hello")
    assert reply.intent == "reverse"
    assert reply.text == "olleh"


def test_word_count():
    reply = Assistant().reply("count words in one two three")
    assert reply.intent == "word_count"
    assert "3" in reply.text


def test_math():
    reply = Assistant().reply("2 * (3 + 4)")
    assert reply.intent == "math"
    assert reply.text == "= 14"


def test_math_integer_division():
    reply = Assistant().reply("10 / 2")
    assert reply.text == "= 5"


def test_help():
    reply = Assistant().reply("what can you help with")
    assert reply.intent == "help"


def test_echo_fallback():
    reply = Assistant().reply("tell me a story")
    assert reply.intent == "echo"
    assert "tell me a story" in reply.text


def test_math_divide_by_zero_falls_back():
    reply = Assistant().reply("1 / 0")
    assert reply.intent != "math"
