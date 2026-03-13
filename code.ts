/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { themeColors: true, /* other options */ })
figma.ui.resize(800, 600)

// Styling
let dimensionLarge = 16;
let dimensionMedium = 8;
let dimensionSmall = 4;
let boldFont = { family: "Inter", style: "Bold" };
let regularFont = { family: "Inter", style: "Regular" };
let textColor = { r: 0, g: 0, b: 0 };
let borderColor = { r: 0.8, g: 0.8, b: 0.8 };
let surfaceColor = { r: 1, g: 1, b: 1 };
let surfaceColorSunken = { r: 0.95, g: 0.95, b: 0.95 };

class ColorVariable {
  name: string;
  id: string;
  constructor(theName: string, theId: string) {
    this.name = theName;
    this.id = theId;
  }
}

class VariableHierarchyVariable {
  name: string;
  id: string;

  constructor(theName: string, theId: string) {
    this.name = theName;
    this.id = theId;
  }
}

class VariableHierarchyPalette {
  name: string;
  path: string;
  variables: VariableHierarchyVariable[] = [];

  constructor(theName: string, thePath: string) {
    this.name = theName;
    this.path = thePath;
  }
}

class VariableHierarchyGroup {
  name: string;
  path: string;
  groups: Record<string, VariableHierarchyGroup> = {};
  palettes: Record<string, VariableHierarchyPalette> = {};

  constructor(theName: string, thePath: string) {
    this.name = theName;
    this.path = thePath;
  }
}

type CollectionHierarchy = {
  id: string;
  name: string;
  hierarchy: VariableHierarchyGroup;
};

type InsertedVariableInfo = {
  palettePath: string;
  variableName: string;
};

function normalizeVariableNameHierarchy(variableName: string): string[] {
  return variableName
    .split('/')
    .map(part => part.trim())
    .filter(Boolean);
}

/**
 * Builds the hierarchy based on naming rules:
 * - last part: variable name
 * - second-to-last part: palette name
 * - all earlier parts: group path
 */
function insertIntoHierarchy(
  rootGroup: VariableHierarchyGroup,
  variableNameHierarchy: string[],
  variableId: string
): InsertedVariableInfo {
  const variableNamePosition = variableNameHierarchy.length - 1;
  const paletteNamePosition = variableNameHierarchy.length - 2;

  const variableName = variableNameHierarchy[variableNamePosition] ?? 'Unnamed';
  const paletteName = variableNameHierarchy[paletteNamePosition] ?? 'Ungrouped';
  const groupNames = variableNameHierarchy.slice(0, Math.max(variableNameHierarchy.length - 2, 0));

  let currentGroup = rootGroup;
  let currentGroupPathParts: string[] = [];

  for (const groupName of groupNames) {
    currentGroupPathParts.push(groupName);
    if (!currentGroup.groups[groupName]) {
      currentGroup.groups[groupName] = new VariableHierarchyGroup(
        groupName,
        currentGroupPathParts.join('/')
      );
    }
    currentGroup = currentGroup.groups[groupName];
  }

  const palettePathParts = [...currentGroupPathParts, paletteName];
  const palettePath = palettePathParts.join('/');

  if (!currentGroup.palettes[paletteName]) {
    currentGroup.palettes[paletteName] = new VariableHierarchyPalette(paletteName, palettePath);
  }

  currentGroup.palettes[paletteName].variables.push(new VariableHierarchyVariable(variableName, variableId));

  return { palettePath, variableName };
}

function getPaletteByPath(
  rootGroup: VariableHierarchyGroup,
  palettePath: string
): VariableHierarchyPalette | null {
  const parts = palettePath
    .split('/')
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  const paletteName = parts[parts.length - 1];
  const groupParts = parts.slice(0, parts.length - 1);

  let currentGroup = rootGroup;
  for (const groupPart of groupParts) {
    const nextGroup = currentGroup.groups[groupPart];
    if (!nextGroup) return null;
    currentGroup = nextGroup;
  }

  return currentGroup.palettes[paletteName] ?? null;
}

function getGroupByPath(
  rootGroup: VariableHierarchyGroup,
  groupPath: string
): VariableHierarchyGroup | null {
  const parts = groupPath
    .split('/')
    .map(part => part.trim())
    .filter(Boolean);

  let currentGroup = rootGroup;
  for (const groupPart of parts) {
    const nextGroup = currentGroup.groups[groupPart];
    if (!nextGroup) return null;
    currentGroup = nextGroup;
  }

  return currentGroup;
}

function collectPalettesFromGroup(group: VariableHierarchyGroup): VariableHierarchyPalette[] {
  const palettes: VariableHierarchyPalette[] = [];
  for (const key in group.palettes) {
    palettes.push(group.palettes[key]);
  }

  for (const key in group.groups) {
    palettes.push(...collectPalettesFromGroup(group.groups[key]));
  }

  return palettes;
}

async function createPaletteGroupFrame(
  group: VariableHierarchyGroup,
  palettes: VariableHierarchyPalette[]
): Promise<void> {
  if (palettes.length === 0) return;

  const paletteGroupFrame = figma.createFrame();
  paletteGroupFrame.name = `${group.path || group.name}`;
  paletteGroupFrame.layoutMode = 'VERTICAL';
  paletteGroupFrame.layoutSizingHorizontal = 'HUG';
  paletteGroupFrame.layoutSizingVertical = 'HUG';
  paletteGroupFrame.itemSpacing = dimensionLarge;
  paletteGroupFrame.fills = [{ type: "SOLID", color: surfaceColorSunken }];
  paletteGroupFrame.paddingLeft =
    paletteGroupFrame.paddingRight =
    paletteGroupFrame.paddingTop =
    paletteGroupFrame.paddingBottom =
    dimensionLarge;
  setBorderRadiusForAll(paletteGroupFrame, dimensionMedium);

  for (const palette of palettes) {
    await createPalette(palette, paletteGroupFrame);
  }
}

(async () => {
  // Initialize the fonts
  await figma.loadFontAsync(boldFont);
  await figma.loadFontAsync(regularFont);

  // Load the local variable collections
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();

  const collectionHierarchies: CollectionHierarchy[] = [];
  const hierarchyByCollectionId = new Map<string, VariableHierarchyGroup>();

  for (const localCollection of localCollections) {
    const hierarchyRoot = new VariableHierarchyGroup('root', '');

    /**
     * Go over each variable in the variable collection
     * variable.name = "color / tomato / 100"
     */
    for (const variableId of localCollection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(variableId);

      // If it's a color, check for an existing group or create one and add it either way.
      if (variable?.resolvedType === 'COLOR') {
        const variableNameHierarchy = normalizeVariableNameHierarchy(variable.name);
        insertIntoHierarchy(hierarchyRoot, variableNameHierarchy, variable.id);
      }
    }

    hierarchyByCollectionId.set(localCollection.id, hierarchyRoot);
    collectionHierarchies.push({
      id: localCollection.id,
      name: localCollection.name,
      hierarchy: hierarchyRoot
    });
  }

  console.log('collectionHierarchies', collectionHierarchies);
  figma.ui.postMessage({ collectionHierarchies });

  // On button click in the UI, create a palette frame for the corresponding palette
  figma.ui.onmessage = async (msg) => {
    // Support both old and new UI payload formats.
    if (msg.type === 'create-palette') {
      const collectionId = msg.collectionId;
      const palettePath = msg.palettePath ?? msg.paletteName ?? msg.palette;
      if (typeof collectionId !== 'string' || typeof palettePath !== 'string') return;

      const hierarchyRoot = hierarchyByCollectionId.get(collectionId);
      if (!hierarchyRoot) return;

      const paletteToCreate = getPaletteByPath(hierarchyRoot, palettePath);
      if (paletteToCreate) createPalette(paletteToCreate);
    }

    if (msg.type === 'create-group-palettes') {
      const collectionId = msg.collectionId;
      const groupPath = msg.groupPath;
      if (typeof collectionId !== 'string' || typeof groupPath !== 'string') return;

      const hierarchyRoot = hierarchyByCollectionId.get(collectionId);
      if (!hierarchyRoot) return;

      const groupToCreate = getGroupByPath(hierarchyRoot, groupPath);
      if (!groupToCreate) return;

      const palettes = collectPalettesFromGroup(groupToCreate);
      await createPaletteGroupFrame(groupToCreate, palettes);
    }
  }
})();

/**
 * A helper function to set the border radius for all corners of a frame
 * @param figmaFrame the frame to set the border radius for all corners
 * @param radius the radius to set
 */
function setBorderRadiusForAll(figmaFrame: FrameNode, radius: number) {
  figmaFrame.bottomLeftRadius =
    figmaFrame.bottomRightRadius =
    figmaFrame.topLeftRadius =
    figmaFrame.topRightRadius =
    radius;
}

/**
 * A helper function to set the padding for all sides of a frame
 * @param figmaFrame the frame to set the padding for all sides
 * @param padding the padding to set
 */
function setPaddingForAll(figmaFrame: FrameNode, padding: number) {
  figmaFrame.paddingLeft =
    figmaFrame.paddingRight =
    figmaFrame.paddingTop =
    figmaFrame.paddingBottom =
    padding;
}
/**
 * 
 * @param colorPaletteToCreate the hierarchy palette to render in Figma
 */
async function createPalette(colorPaletteToCreate: VariableHierarchyPalette, parentFrame?: FrameNode) {
  // Define some constants for styling the palette frames and text

  const colorPalette = colorPaletteToCreate;

  if (colorPalette) {
    // Create a frame named {paletteName}
    let paletteFrame = figma.createFrame()
    if (parentFrame) parentFrame.appendChild(paletteFrame)
    paletteFrame.name = colorPalette.name
    paletteFrame.layoutMode = 'VERTICAL'
    setPaddingForAll(paletteFrame, dimensionLarge);
    paletteFrame.layoutSizingHorizontal = 'HUG'
    paletteFrame.itemSpacing = dimensionMedium
    setBorderRadiusForAll(paletteFrame, dimensionMedium);
    paletteFrame.fills = [{ type: "SOLID", color: surfaceColor }];


    // Create a text with the {paletteName}
    let paletteNameText = figma.createText()
    paletteFrame.appendChild(paletteNameText) // Place in frame
    paletteNameText.fontName = boldFont;
    paletteNameText.fills = [{ type: "SOLID", color: textColor }]
    paletteNameText.name = "Palette Name"
    paletteNameText.characters = colorPalette.name
    paletteNameText.layoutAlign = 'STRETCH'

    // Add a frame named "Colors"
    let colorsFrame = figma.createFrame()
    paletteFrame.appendChild(colorsFrame) // Place in frame
    colorsFrame.name = "Colors"
    colorsFrame.layoutMode = 'HORIZONTAL'
    colorsFrame.layoutSizingVertical = 'HUG'
    colorsFrame.itemSpacing = dimensionMedium

    // todo bug: wenn es zwei mal die selbe palette mit selbem namen gibt wird das zusammen gepackt ( green-olive xD)

    /**
     * Add each color
     * color = { name: "100", id: "VariableID:1234:123" }
     */
    colorPalette.variables.forEach(async (color) => {
      // Create a wrapper
      let colorWrapper = figma.createFrame()
      colorsFrame.appendChild(colorWrapper) // Place in colors frame
      colorWrapper.name = "Color Wrapper"
      colorWrapper.layoutMode = 'VERTICAL'
      colorWrapper.layoutSizingHorizontal = 'HUG'
      setPaddingForAll(colorWrapper, dimensionMedium);
      colorWrapper.itemSpacing = dimensionSmall;
      colorWrapper.strokes = [{ type: "SOLID", color: borderColor }];
      setBorderRadiusForAll(colorWrapper, dimensionMedium);
      //todo add border

      // Add the name of the color. E.g. "100", "200" etc.
      let colorValueText = figma.createText()
      colorWrapper.appendChild(colorValueText) // Place in color wrapper
      colorValueText.fontName = regularFont;
      colorValueText.name = "Color Name"
      colorValueText.characters = color.name
      colorValueText.fills = [{ type: "SOLID", color: textColor }]
      colorValueText.layoutAlign = 'STRETCH'
      colorWrapper.appendChild(colorValueText)

      // Create a frame to be filled with the color
      let colorFrame = figma.createFrame()
      colorWrapper.appendChild(colorFrame) // Place in color wrapper
      colorFrame.name = "Color"
      colorFrame.layoutMode = 'VERTICAL'
      colorFrame.resize(100, 60)
      colorFrame.counterAxisAlignItems = 'CENTER'
      setPaddingForAll(colorFrame, dimensionSmall);
      setBorderRadiusForAll(colorFrame, dimensionMedium);

      // Load the variable for the color id
      const fillColorVariable = await figma.variables.getVariableByIdAsync(color.id);
      // Fills are immutable, so copy the array before rebinding paint variables.
      if (fillColorVariable && Array.isArray(colorFrame.fills) && colorFrame.fills.length > 0) {
        const fillsCopy = colorFrame.fills.slice();
        fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', fillColorVariable);
        colorFrame.fills = fillsCopy;
      }

      // Add the contrast with white on the color
      let whiteContrastText = figma.createText()
      colorFrame.appendChild(whiteContrastText) // Place in color wrapper
      whiteContrastText.fontName = regularFont;
      whiteContrastText.name = "Contrast"
      let resolvedFillColor: RGB = { r: 0, g: 0, b: 0 };
      if (Array.isArray(colorFrame.fills) && colorFrame.fills.length > 0) {
        const paint = colorFrame.fills[0];
        if (paint.type === "SOLID" && 'color' in paint) {
          resolvedFillColor = paint.color;
        }
      }
      let contrastWithWhite = calculateContrast({ r: 1, g: 1, b: 1 }, resolvedFillColor).toFixed(2);
      whiteContrastText.characters = contrastWithWhite;
      whiteContrastText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }]

      if (parseFloat(contrastWithWhite) >= 4.5) {
        let hasContrastAA = figma.createText()
        hasContrastAA.characters = "AA"
        hasContrastAA.name = "AA"
        hasContrastAA.fontName = regularFont;
        colorFrame.appendChild(hasContrastAA) // Place in color wrapper
        hasContrastAA.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }]
      }

    })
    figma.viewport.scrollAndZoomIntoView([paletteFrame])
  }
}

/**
 * 0.2126 * R + 0.7152 * G + 0.0722 * B
 */
function calculateLuminance(color: RGB): number {
  // Convert sRGB to linear RGB
  const r = color.r <= 0.03928 ? color.r / 12.92 : Math.pow((color.r + 0.055) / 1.055, 2.4);
  const g = color.g <= 0.03928 ? color.g / 12.92 : Math.pow((color.g + 0.055) / 1.055, 2.4);
  const b = color.b <= 0.03928 ? color.b / 12.92 : Math.pow((color.b + 0.055) / 1.055, 2.4);

  // Calculate relative luminance
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Contrast is being caluclated by: (L1 + 0.05) / (L2 + 0.05) , whereaas 
 * L1 is the relative luminance of the lighter of the colors and 
 * L1 the relative luminance of the darker of the colors
 * @param color1 
 * @param color2 
 * @returns 
 */
function calculateContrast(color1: RGB, color2: RGB): number {
  const luminance1 = calculateLuminance(color1);
  const luminance2 = calculateLuminance(color2);

  const lighter = Math.max(luminance1, luminance2);
  const darker = Math.min(luminance1, luminance2);

  return (lighter + 0.05) / (darker + 0.05);
}