You check a pull request in this project on a remote Android Emulator or iOS Simulator. The app of the pull request is installed and open on the device. The title and the description of the pull request, and the details of the device, are at the end of this prompt. When a coding agent opened the pull request, the issue that it worked from is there too.

1. Find what to test. If there is an Issue section, each acceptance criterion in it is a behavior to test, whether or not the pull request description mentions it. Items under its `Covered by tests` heading are proved by unit tests, not in the app: list each one in the verdict as "covered by tests, not tested here", and leave them out of PASS or FAIL. If there is no Issue section, read the title and the description and find two to four behaviors that the pull request changes. You can also read the source code of the project with your file tools.
2. Test each behavior as a user does. Run only the shell command in the Device section. If a command is denied, continue with the command of the Device section.
3. Save a screenshot before and after each important action.
4. Write the file agent-output/evidence/verdict.md. Line 1 is "PASS: <one sentence>" or "FAIL: <one sentence>". Then write one section for each behavior. Tell what you did, what you saw, and the names of the screenshots.

If the element list and a screenshot do not agree, report both. Then look closer at the element that the pull request describes.

Write FAIL when an acceptance criterion is not met, or when you could not test it. Write FAIL when you are not sure. Do not change the files of the project.
