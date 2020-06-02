# How to build a rundown using spreadsheets

## Terminology

### Stories

Stories are the main structure of your rundown, they are indicated by the [SECTION](#SECTION) story type. Each story contains a number of items.

### Items

Items are the content of your show, the 'Object Type' column set the type of item (see [Object Types](#Object-Types)).

## Spreadsheet Features

### Float

Stories and items can be "floated" by checking the Float checkbox. This is a way of removing elements from a rundown without having to delete them.

### Place on Screen

By specifying a screen name in this column, the corresponding item will be placed on the corresponding screen. Note - currently only one screen is supported.

### Object Types

The available object types are:

- Camera
- Video
- Graphic
- Overlay
- Remote
- Transition
- Voiceover
- Script
- PIP
- Split

#### Camera

The camera item requires that Attribute 1 be set with the name of the camera to switch to. Currently, camera names must begin with either "k" or "c", e.g. "kam1" / "cam2".

#### Video

Videos must have the clip name set. The available clips should be in a dropdown populated automatically by Sofie.

#### Voiceover

The Voiceover item can be added to any story, allowing for a studio mic to be live over top of, for example, a video. The voiceover item must have a script in the Script column.

#### Script

The Script item can be added to any story and must have text in the "Script" column. Any text placed in script items, or in the script column of other items, will be placed on the prompter in your studio.

#### PIP and Split

See the [DVE story type](#DVE).

## Story Types

### SECTION

The section story type is the best way for you to break up your show into manageable sections. Think of it as marking the individual segments that your show consists of. For example, you might have a segment called "Headlines" followed by one called "Lead Story".

Every row between the start of one section and the start of another belongs to that section. Every section should be given a name, this will appear in the Sofie rundown view to help you to identify each section.

### HEAD

The HEAD story type is a special story type for defining a headlines segment. It is not mandatory to use this story type for your headlines, but doing so means that some behaviour is automatically defined. The first clip in a headlines segment will start with a CUT transition, and will WIPE out. Following clips will WIPE in and out.

The HEAD story is best used with a series of videos, one after the other, though overlays and cameras are also supported. Only the first video in your headlines needs to be given the HEAD story type. All videos after the first must have their story type left blank, setting the story type to HEAD on susequent videos will start a new HEADLINES block.

### CAM

The CAM story type switches to a camera. You must also set the object type to camera. You can then set the camera name in Attribute 1, as with any camera object.

The CAM story type can be seen as a way to indicate in the rundown view that this is a separate piece to camera, as it appears to a separate part. This also gives the opportunity to delay switching to the new camera, or to hold on the camera.

You can add a transition object directly below a CAM to set the transition style used when the camera is cut to, alternatively, you can also set this in the Transition column directly on the CAM row.

### PACKAGE

The PACKAGE story type is for videos. It is a good way of separating a video package into its own part, however, it is also has strictly defined behaviour - it will open with a MIX transition, and end with a DIP transition.

### FULL

The FULL story type is the more flexible version of PACKAGE. It supports videos, graphics, remotes, and cameras, as well as changing the transition style. It can be though of as the default story type, when you want something to be played full-screen.

### TITLES

The TITLES story type is used for your opening titles. It supports videos and graphics and will finish with a DIP transition.

### BREAKER

The BREAKER story type will WIPE  in and out. It supports videos and graphics.

### DVE

The DVE story type is used for PIP and other multi-source views. Only the first row of the DVE (where the DVE story type is set) defines the start time and duration. Setting the object type to pip means that exactly two rows of sources must be defined, with SPLIT, anyhwere between two and four sources can be defined. The sources will be automatically positioned according to the number of sources specified.

Rows below the first row of the DVE support all object types. A row with the transition object type can be added to set the opening transition for the entire DVE object.

### Note for vMix Users

If you are using the vMix workflow, the DIP transition does not exist and is replaced with the FADE transition.
