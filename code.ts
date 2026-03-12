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

(async () => {
  // Initialize the fonts
  await figma.loadFontAsync(boldFont);
  await figma.loadFontAsync(regularFont);

  // Load the local variable collections
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();

  // Send all available local variable collections to the UI
  let localCollectionsFormatted = [{}]
  localCollections.forEach(collection => {
    localCollectionsFormatted.push({ name: collection.name, id: collection.id })
  })
  figma.ui.postMessage({ localCollections: localCollectionsFormatted });

  // todo for testing purposes only first collection is fully loaded
  const firstCollection = localCollections[0];

  const hierarchyRoot = new VariableHierarchyGroup('root', '');
  /**
   * Go over each variable in the variable collection
   * variable.name = "color / tomato / 100"
   */
  for (let variableId of firstCollection.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(variableId);

    // If it's a color, check for an existing group or create one and add it either way.
    if (variable?.resolvedType === 'COLOR') {
      const variableNameHierarchy = normalizeVariableNameHierarchy(variable.name);
      insertIntoHierarchy(hierarchyRoot, variableNameHierarchy, variable.id);
    }
  }

  console.log('colorVariableHierarchy', hierarchyRoot);
  figma.ui.postMessage({ colorVariableHierarchy: hierarchyRoot });

  // On button click in the UI, create a palette frame for the corresponding palette
  figma.ui.onmessage = (msg) => {
    // Support both old and new UI payload formats.
    if (msg.type === 'create-palette') {
      const palettePath = msg.palettePath ?? msg.paletteName ?? msg.palette;
      if (typeof palettePath !== 'string') return;

      const paletteToCreate = getPaletteByPath(hierarchyRoot, palettePath);
      if (paletteToCreate) createPalette(paletteToCreate);
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
 * 
 * @param colorPaletteToCreate the hierarchy palette to render in Figma
 */
async function createPalette(colorPaletteToCreate: VariableHierarchyPalette) {
  // Define some constants for styling the palette frames and text

  const colorPalette = colorPaletteToCreate;

  if (colorPalette) {
    // Create a frame named {paletteName}
    let paletteFrame = figma.createFrame()
    paletteFrame.name = colorPalette.name
    paletteFrame.layoutMode = 'VERTICAL'
    paletteFrame.paddingLeft =
      paletteFrame.paddingRight =
      paletteFrame.paddingTop =
      paletteFrame.paddingBottom =
      dimensionLarge;
    paletteFrame.layoutSizingHorizontal = 'HUG'
    paletteFrame.itemSpacing = dimensionMedium
    setBorderRadiusForAll(paletteFrame, dimensionMedium);


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
      colorWrapper.paddingLeft =
        colorWrapper.paddingRight =
        colorWrapper.paddingTop =
        colorWrapper.paddingBottom =
        dimensionMedium;
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
      colorFrame.resize(100, 100)
      setBorderRadiusForAll(colorFrame, dimensionMedium);

      // Load the variable for the color id
      const fillColorVariable = await figma.variables.getVariableByIdAsync(color.id);
      // Fills are immutable, so copy the array before rebinding paint variables.
      if (fillColorVariable && Array.isArray(colorFrame.fills) && colorFrame.fills.length > 0) {
        const fillsCopy = colorFrame.fills.slice();
        fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', fillColorVariable);
        colorFrame.fills = fillsCopy;
      }
    })

  }
}
