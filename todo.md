- [ ] Parse system
  - [ ] Download file / sheet
  - [ ] parse line 2 for properties + position
  - [ ] parse story etc.
  - [ ] Make ordering (RunningOrder has many Sections has many Stories has many Items)
  - [ ] diff system to detect changes
- [ ] classes + interfaces
- [ ] basic event system (send CRUD stuff)
- [ ] rpc for auth
- [ ] Write-back system (update ID etc.)


Issues:
- [X] There is a conflict in the ID of a story and the first ITEM on a story.  (for now; id of object = "id of story" + "_item")
- [ ] 