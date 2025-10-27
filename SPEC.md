# Software Specification

This is a functional spec for an application called ImageLinks, meant for an AI tool to help build it using all of the details described here.

## Description

ImageLinks is a simple program which will examine an image for any QRcodes or web hyperlinks (URL). After analyzing the image, the program will show a results window listing all of the links and QRcode information found. The links should be clickable to bring them up in a browser.

## Functional Behavior

### General Description

The program should be a UI program (not a script).

The program should operate in 2 modes:

1. When double-clicking to launch the program, go to a file open dialog for the user to choose the file
2. When an image is dragged and dropped onto the program icon, it should process that file

Supported image types: JPG/JPEG, PNG, HEIC, WebP. If a non-supported file type is opened by the program, display a nice error message explaining the supported types, then exit. If a file greater than 10MB is provided, give a nice error message that it exceeded the maximum size.

Supported operating systems: Mac, Windows, Linux. Mac will be the first target, but the program should be capable of being built for the other platforms later.

### Image Analysis

The user-provide image should be analyzed for both QRcodes and URLs, as follows:

#### QRcodes

Check the image for any QRcodes to find all that exist in the image. For each one found, decode the QRcode and return the value. The value might be text or a URL.

If a URL is found in the QRcode, just display it in the QRcode section in the results.

#### URLs

Detect all text from the image and return any text that is a web link (URL), for example starting with "http://" or "https://".

Text that appears to be a web address like "google.com" or "www.example.com/my/page" should also be detected and included. Any partial web addresses like this should be assumed to have "https://" when shown in the window.

Do not detect or do anything with email addresses.

#### Error Handling

If there are any errors during image analysis, handle them in a smooth way and inform the user of the problem.

### Results Window

The results window should include the following:

- At the top show the image name, but don't show the image itself
- A section titled QRcodes with anything found listed underneath. Next to each should be a "copy to clipboard" icon which does the same.
- A section titled Links with anything found listed underneath, these links should be clickable. Next to each should be a "copy to clipboard" icon which does the same.
- The window should stay up even after copying to clipboard.
- If QRcode or Links are not found, don't show that respective section
- If nothing was found in the image, show a text message explaining that
- Pressing a Close button or the Esc key should close the window
- The window should be non-modal

## Technology Choices

Build this as a Node-based Electron app.

Create it using standard Node and Electron conventions.

For the image analysis components, use common (popular) Node libraries.

For packaging, use electron-builder.

The initial platform will be Mac, but we should support Windows and Linux in the future.

For the Mac, we don't need support for signing to start with, but might add that in the future.

## Test Images

A set of test images are included under ./test/images.

The project tests should include a test against these images to detect URLs and Text.

The expected values for each image are documented below.

### text-note-L.png

expected_urls = [
"https://hackernoon.com/how-to-take-screenshots-in-the-browser-using-",
"https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview",
"https://blog.saeloun.com/2022/06/09/copying-texts-to-clipboard-using-",
"https://github.com/Y2Z/monolith",
"https://docs.anthropic.com/en/docs/build-with-claude/tool-use/text-editor-"
]
expected_text = []

### text-note.png

expected_urls = [
"https://hackernoon.com/how-to-take-screenshots-in-the-browser-using-",
"https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview",
"https://blog.saeloun.com/2022/06/09/copying-texts-to-clipboard-using-",
"https://github.com/Y2Z/monolith",
"https://docs.anthropic.com/en/docs/build-with-claude/tool-use/text-editor-"
]
expected_text = []

### multiple-qrcodes.jpg

expected_urls = [
"https://search.google.com/local/writereview?placeid=ChIJ79DNyOvG10cRbHOP0u7w1CM",
"https://search.google.com/local/writereview?placeid=ChIJ79DNyOvG10cRbHOP0u7w1CM",
"https://search.google.com/local/writereview?placeid=ChIJ79DNyOvG10cRbHOP0u7w1CM"
]
expected_text = []

### qrcode.png

expected_urls = ["https://dspy.ai"]
expected_text = []

### qr-text.png

expected_urls = []
expected_text = ["The autumn wind is a raider"]
