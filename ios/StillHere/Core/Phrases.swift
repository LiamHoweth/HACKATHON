// Mirrors src/core/phrases.ts. Critical interruption phrases come first so they are reached quickly when scanning.
import Foundation

enum Phrases {
    static let builtIn: [SavedPhrase] = [
        SavedPhrase(id: "qp-something-to-say", text: "I have something to say."),
        SavedPhrase(id: "qp-moment", text: "Please give me a moment."),
        SavedPhrase(id: "qp-not-finished", text: "I'm not finished."),
        SavedPhrase(id: "qp-repeat", text: "Can you repeat that?"),
        SavedPhrase(id: "qp-not-meant", text: "That's not what I meant."),
        SavedPhrase(id: "qp-earlier", text: "I want to answer your earlier question."),
        SavedPhrase(id: "qp-change-subject", text: "Let me change the subject."),
        SavedPhrase(id: "qp-question", text: "I have a question."),
        SavedPhrase(id: "qp-stop", text: "Please stop."),
        SavedPhrase(id: "qp-help", text: "Please get someone to help me."),
    ]

    /// Grouped-letter scanning layout. Each group opens a page of single keys.
    static let keyGroups: [(label: String, keys: [String])] = [
        ("A B C D E F", ["A", "B", "C", "D", "E", "F"]),
        ("G H I J K L", ["G", "H", "I", "J", "K", "L"]),
        ("M N O P Q R", ["M", "N", "O", "P", "Q", "R"]),
        ("S T U V W X", ["S", "T", "U", "V", "W", "X"]),
        ("Y Z . , ? !", ["Y", "Z", ".", ",", "?", "!"]),
        ("' - 1 2 3 4 5", ["'", "-", "1", "2", "3", "4", "5"]),
        ("6 7 8 9 0", ["6", "7", "8", "9", "0"]),
    ]

    static let testVoiceText = "This is my voice for Still Here."
}
