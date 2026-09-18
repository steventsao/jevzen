---
name: Feed Analysis
description: A reading lens with visible, adjustable attenuation.
colors:
  paper: "#f5f7fa"
  surface: "#fff"
  ink: "#1d2a3c"
  muted: "#586679"
  line: "#dce2e9"
  blue: "#244fd5"
  blue-light: "#eaf0ff"
  error: "#9a3327"
  primary-hover: "#1b3fac"
  secondary-surface: "#e3eafa"
  secondary-ink: "#233e82"
  secondary-hover: "#d4dff5"
  focus: "#7396f0"
  field-border: "#a9b5c7"
  score-track: "#e5eaf1"
  score-fill: "#647da7"
  collapsed-surface: "#f8fafd"
typography:
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "29px"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.03em"
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  post:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
  helper:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  measurement:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  field: "6px"
  action: "7px"
  composer: "8px"
  feed: "12px"
  switch: "12px"
  circle: "50%"
spacing:
  icon-gap: "8px"
  compact: "10px"
  small: "12px"
  group: "16px"
  section: "20px"
  popup-rail: "24px"
  post-inline: "27px"
  feed-inline: "48px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "10px 15px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.secondary-surface}"
    textColor: "{colors.secondary-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "10px 15px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.blue}"
    padding: "2px 0"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px"
    width: "100%"
  topic-filter:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.field}"
    padding: "8px 10px"
  topic-filter-selected:
    backgroundColor: "{colors.blue-light}"
    textColor: "{colors.blue}"
  topic-tag:
    textColor: "{colors.muted}"
    typography: "{typography.measurement}"
  post-list:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.feed}"
  post:
    textColor: "{colors.ink}"
    padding: "25px 27px"
  post-collapsed:
    backgroundColor: "{colors.collapsed-surface}"
    padding: "17px 27px"
  score-track:
    backgroundColor: "{colors.score-track}"
    height: "3px"
  score-fill:
    backgroundColor: "{colors.score-fill}"
    height: "100%"
  switch:
    rounded: "{rounded.switch}"
    width: "34px"
    height: "20px"
  switch-checked:
    backgroundColor: "{colors.blue}"
  story-group:
    textColor: "{colors.muted}"
    rounded: "{rounded.action}"
    padding: "11px 14px"
  story-group-selected:
    backgroundColor: "{colors.blue-light}"
---

# Design System: Feed Analysis

## Overview

**Creative North Star: "The Reading Lens"**

Feed Analysis makes a feed quieter while keeping the reader in control. Its implemented visual language pairs cool paper, deep blue-black ink, cobalt actions, and fine separators with compact system typography. The post remains the primary reading material; measurements and reversible actions sit alongside it.

The interface has the precision of a small instrument panel: understated controls, directly labelled percentages, and restrained tonal changes. This document captures the working implementation, rather than claiming an independently established brand identity. The **Operate** mode and the control-rail composition belong to the [surface brief](.impeccable/feed-analysis-surface.md); they are not a global mode or a requirement for every future Feed Analysis surface.

The installed extension presents rules, connection and display controls, and groups from an open X feed in its popup and settings. Reading and story focus happen on X itself. The separate developer lab retains the synthetic feed, composer, and reading-row examples described here; those examples and lab navigation do not appear in the shipping extension views.

**Key Characteristics:**

- Cool neutral surfaces with cobalt action and selection states.
- Readable posts with compact, visibly separate measurement controls.
- Flat surfaces divided by fine borders and spacing.
- Proportional fading, reversible reveal, and explicit high-score collapse.
- A geometric SVG mark made from three shortening horizontal strokes.

## Colors

The palette is cool and restrained, with action blue carrying the strongest chroma. The frontmatter is the normative source for extracted color values; the root CSS properties retain their existing names. The sidecar's generated tonal ramps are panel previews derived from those colors, not additional production tokens.

### Primary

- **Action Cobalt** (`blue`): primary buttons, links, enabled switches, checkbox accents, slider thumbs, selected topic labels, and the geometric mark.
- **Selection Mist** (`blue-light`): selected topic and story backgrounds, and informational notices.
- **Pressed Cobalt** (`primary-hover`): the enabled primary button's hover state.
- **Quiet Action Blue** (`secondary-surface`, `secondary-ink`, `secondary-hover`): secondary filled actions such as **Open X** and **Group loaded posts** in the extension, or adding text in the developer lab.
- **Focus Periwinkle** (`focus`): the visible keyboard outline on supported controls in the lab, popup, and settings.

### Neutral

- **Cool Paper** (`paper`): the lab canvas and popup body.
- **Reading White** (`surface`): the masthead, feed container, and form fields.
- **Deep Ink** (`ink`): headings, post text, and score numerals.
- **Slate Annotation** (`muted`): helper text, context, topic labels, and secondary information.
- **Fine Divider** (`line`): control sections, masthead, feed perimeter, and post separators.
- **Field Edge** (`field-border`): compact input and select outlines.
- **Measurement Slate** (`score-fill`, `score-track`): the turn-down probability bar; it stays quieter than actions.
- **Folded Paper** (`collapsed-surface`): the lab's collapsed rows.

Error copy uses **Error Clay** (`error`) with a pale warm notice background. The connection dot uses green only with an accompanying status label. These are status indications, not a second decorative accent family.

**The Measurement Rule.** Keep the turn-down probability track in the existing slate treatment; its label and percentage describe how the applied rules fit a post, not a traffic-light verdict about the author.

## Typography

**Display and body font:** the platform system stack in the frontmatter. There are no downloaded fonts. The hierarchy comes from scale, weight, spacing, and reading line length.

- **Display:** the lab feed heading, with tight tracking and a compact line height. It reduces at the existing responsive breakpoints.
- **Headline:** the control-rail headline; the popup and narrow layout use the implemented smaller size (23px).
- **Title:** ordinary section headings. Rail section labels reduce to a compact size (13px); the composer heading uses a larger title (17px).
- **Body:** the interface baseline. Post copy uses the separate `post` role, spacious leading, preserved line breaks, arbitrary-word wrapping, and a maximum measure (70ch).
- **Label:** buttons and controls. Selected topic labels and numeric outputs use the slightly heavier implemented weight (650).
- **Helper:** compact explanatory text. The more narrative control and explanation paragraphs use roomier leading than the baseline helper role.
- **Measurement:** the label for the turn-down probability track; its value is slightly larger (11px). Percentages and counts use tabular numerals.

**The Text Leads Rule.** Keep post copy larger and more generously spaced than measurements and metadata; avoid turning the probability readout into the headline of each post.

## Layout

The desktop lab centers a bounded workspace (maximum 1336px). Its control rail is fixed (302px), and the feed column absorbs the remaining width. The masthead is slim (80px high); the feed area has generous horizontal padding from `feed-inline` and a bounded width (966px). Controls use fine section dividers instead of individual floating cards. Posts share one enclosing surface and have separators between rows.

The lab layout has three explicit media thresholds. At widths up to 1000px, the rail narrows (270px), feed padding contracts, and heading and toolbar actions stack. At widths up to 650px, the rail moves above the feed, topic choices wrap horizontally, story groups become a single column, post type reduces (14px), and feed padding becomes compact (28px 16px 36px). At widths from 1600px, side borders mark the centered workspace edges. These are observed implementation thresholds, not a new global device taxonomy.

The extension popup is a fixed narrow surface (360px wide, minimum height 530px) with a compact masthead (60px) and rail padding (22px 24px). It naturally grows and scrolls with its content. Its topics also wrap because the narrow media rules apply. The settings page uses the same controls in a single white surface (maximum 640px), with a compact masthead (64px) and control padding (28px). At widths up to 650px, settings fills the viewport without an outer border, radius, or margin. Use the same control vocabulary across these surfaces, with density adapted to available space.

The X/Twitter overlay is a separate host-bound context. It inherits the host's text color and uses `currentColor` mixes for separators, button borders, and hover fills. Do not apply the light lab canvas over the host feed.

## Elevation & Depth

The implemented system uses no box shadows. Depth comes from white reading surfaces against cool paper, thin separators, selection tint, and spacing. Feed rows share a single perimeter; story choices use subtle tinted surfaces. Hover does not lift or translate containers. Keyboard focus is an outline, not simulated elevation.

**The Flat Surface Rule.** Continue the existing tonal and border hierarchy when extending these controls; introduce elevation only for a future component whose interaction requires it.

## Shapes

The form language uses mildly rounded action and field corners, with a larger radius around the shared feed container. Use the extracted `field`, `action`, `composer`, and `feed` radii for their corresponding roles. Circular avatar initials and switch thumbs are the exceptions. Probability tracks have square ends; range tracks have only the tiny implemented radius (1px).

The app mark is inline SVG: three rounded horizontal strokes progressively shorten from top to bottom. Its normal masthead box is larger (31px) than ordinary icons (20px), and it reduces in the popup (26px). The mark is decorative beside the written product name and is hidden from assistive technology. No shipping raster assets are present; screenshots in `feed-analysis/artifacts/` are verification artifacts, not product imagery.

## Components

### Buttons

Primary and secondary buttons are compact, filled, and plainly labelled. Use their frontmatter padding and action radius, with the implemented minimum height (40px). Primary hover darkens the cobalt; secondary hover strengthens the pale blue. Text actions use compact blue text, no fill, and an underline on hover. Disabled buttons use reduced opacity (0.5) and a default cursor; enabled-only hover rules keep disabled states stable.

The common keyboard treatment is an offset outline (3px, 4px offset). It is implemented for buttons, links, inputs, textareas, and disclosure summaries. Provider selects currently retain native browser focus behavior. The X overlay's controls have their own smaller focus outline (2px, 3px offset).

### Inputs and Controls

The rules editor uses one free-form textarea with an external label and nearby helper text. It reuses the white field surface, neutral border, and field radius, with vertically resizable height (155px to 450px), compact reading type (13px), and comfortable leading (1.6). The cobalt **Apply** action sits beside the draft status: **Unapplied changes**, **Applying…**, or **Applied**. Typing only changes the draft. While it differs from the applied text, **View applied rules** exposes the rules currently shaping the feed, with line breaks preserved. Apply is disabled for an empty draft or while an application is pending.

Apply feedback stays directly below that action row and uses a status announcement. Success copy such as **Rules applied.** uses muted helper text; failures use the existing error color. A failed Apply leaves the draft editable and the previous applied rules inspectable. Editing again clears the prior feedback. Keep the feedback beside the rules that caused it.

Settings fields use white backgrounds, fine neutral borders, and the field radius. Their labels remain outside the input. The developer lab's composer has a separate larger radius and inset padding (14px), with vertical resizing and bounded height (95px to 450px). The provider selector uses the same compact field silhouette, including provider-specific fields when relevant.

Switches use a compact rounded track and a white circular thumb (14px). Enabled tracks use action cobalt. The thumb travels horizontally (14px); both fill and position transition over 180ms with `ease-out`. Native checkboxes use the same cobalt accent. Strength and threshold ranges pair a numerical output with descriptive endpoints or labels; the custom thumb is circular (16px) with a cobalt stroke (3px).

### Topic Navigation and Tags

Topic filters are quiet text-and-count rows. Their selected state uses selection mist, cobalt text, and stronger weight. They are buttons with `aria-pressed`, not navigation links. On narrow surfaces, the same choices wrap without changing their meaning. The extension counts analyzed posts from an open X tab and applies the selected topic to that feed. Post topic tags are unfilled, muted labels; do not turn each into a bright pill.

### Feed Rows and Measurements

In the developer lab, each post sits inside the shared feed container. Author initials, author name, and context precede the text. The analysis strip presents one **Turn down** percentage and a fine slate track, a topic label, a reveal action, and a **Why?** disclosure. The disclosure explains the probability against the applied rules and shows the exact rules used for that result, with line breaks and long text preserved; an unapplied draft must not replace that evidence. The analysis controls stay fully readable when the post body fades. The installed extension adds its analysis controls to posts on X; popup and settings do not render a sample feed.

Attenuation changes both opacity and saturation proportionally. In the lab, the transition is 200ms with `ease-out`; in the X feed it is 180ms. Hover and keyboard focus within a noncollapsed post restore its body to full visibility. A collapsed row keeps the measurements and **Show anyway** action visible, and revealing it changes the action to **Apply filter**. Unscored and failed posts remain readable. Reduced-motion preference removes these transitions.

### Story Groups and Status

Story choices use lightly tinted buttons, with a cobalt border and selection tint for the selected state. The developer lab uses two columns, becoming one on narrow screens, and pairs a stronger post count with a quieter excerpt. Popup and settings use one column of count-and-excerpt buttons from actual loaded X posts; selecting a story focuses those posts on X. Informational and error notices use bounded tinted strips with inline copy, while connection state pairs a small dot with a readable label. No standalone loading illustration or decorative hero image is part of this system.

## Do's and Don'ts

### Do:

- Do preserve readable post text and a fully visible route to reveal any filtered post.
- Do show one named turn-down probability with a tabular percentage and a quiet slate track.
- Do keep draft status and Apply success or error feedback beside the rules editor, and show the exact applied rules in each post’s Why disclosure.
- Do reuse the implemented cobalt action states, cool paper surfaces, fine borders, and system font stack.
- Do keep keyboard focus visible and honor reduced-motion preferences.
- Do let X/Twitter overlays inherit the host theme while the lab, popup, and settings use their own light surfaces.
- Do treat screenshots as verification evidence and the geometric inline SVG as the current app mark.

### Don't:

- Don't present model probability as a factual verdict about the author.
- Don't fade the measurement controls or reveal action with the post body.
- Don't hide unscored or failed posts as though they had received a high score.
- Don't introduce decorative shadows or arbitrary accent colors into the existing control surfaces.
- Don't promote the surface's Operate mode or its desktop rail into a permanent global product identity.
- Don't describe this implementation as shipping raster imagery, a custom font, or a discovered topic ontology.
