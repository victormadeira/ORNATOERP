# SketchUp Woodworking/Cabinetmaking Plugins - Comprehensive Research
## Competitive Analysis Report (March 2026)

---

## TABLE OF CONTENTS

1. [Commercial Plugins (Paid)](#1-commercial-plugins-paid)
2. [Free/Community Plugins](#2-freecommunity-plugins)
3. [Dynamic Components Deep Dive](#3-dynamic-components-deep-dive)
4. [Industry Trends & Market Gaps](#4-industry-trends--market-gaps)
5. [Competitive Matrix](#5-competitive-matrix)

---

## 1. COMMERCIAL PLUGINS (PAID)

### 1.1 Mozaik Software
**Website:** https://www.mozaiksoftware.com
**Target Market:** Small to large cabinet shops (12,000+ shops worldwide)
**SketchUp Integration:** YES - Mozaik Design integrates with SketchUp for rendering/visualization

#### Features:
- Parametric cabinet design (NOT using SketchUp Dynamic Components - own proprietary system)
- Automatic hardware boring for hinges, slides, handles
- CNC joint fasteners with automatic placement
- True-shape nesting optimization
- CNC MDF Doors and CNC Dovetail Drawers
- Live-updating 3D views
- Automatic cut list, shop drawings, assembly sheets
- Pricing and estimating

#### Export Formats:
- G-code (post processors for 175+ CNC machine brands)
- CSV (for beam saws)
- DXF
- Print-ready shop drawings

#### Pricing:
| Tier | Price | Key Features |
|------|-------|-------------|
| Manufacturing | $125/month | Design, cut lists, shop drawings, pricing |
| CNC | $225/month | + nesting, CNC output, dovetail drawers |
| Enterprise | $325/month | + job dashboard, multi-user, multiple optimizer runs |

*3-month paid trial, then converts to annual subscription*

#### Construction Types:
- Face frame and frameless (European) cabinets
- Hardware: cam-lock, dowel, confirmat, various connectors

#### Strengths:
- Most widely used cabinet CNC software
- 175+ post processors for CNC machines
- Strong community and training resources
- Bidirectional SketchUp integration

#### Weaknesses:
- Windows only (Mac needs emulation)
- SketchUp integration is mainly for rendering, not full design
- Cannot import SketchUp Dynamic Components
- Steep learning curve
- Subscription pricing adds up

---

### 1.2 CabinetSense
**Website:** https://www.cabinetsensesoftware.com
**Target Market:** Small to mid-size cabinet shops, custom cabinetmakers
**SketchUp Integration:** YES - runs as a SketchUp extension (Extension Warehouse)

#### Features:
- True parametric cabinet drawing inside SketchUp
- Story stick technology for quick layout
- Drag-and-drop cabinet placement
- Face frame (layon) and frameless construction
- Slab or five-piece doors
- Drawer boxes: butt, dado, dovetailed construction
- Automatic cutting list generation
- Sheet cutting diagram optimization
- All parts automatically labelled
- DXF export for CNC

#### Export Formats:
- DXF (compatible with Vectric, Enroute, AlphaCam, MasterCam, SheetCam)
- CutList Plus compatible format
- CSV
- Print-ready drawings

#### Pricing:
- Starting at $25/month
- Free trial available
- Annual subscription options

#### Dynamic Components:
- Does NOT use SketchUp's DC system
- Uses its own parametric engine within SketchUp

#### Strengths:
- Runs natively inside SketchUp (no separate software)
- Affordable entry price
- Supports both face frame and frameless
- Good DXF export for CNC workflows
- Story stick technology is intuitive

#### Weaknesses:
- Learning curve despite running inside SketchUp
- Limited compared to Mozaik for large-scale production
- DXF requires separate CAM software for tool paths

---

### 1.3 Polyboard (by Boole & Partners)
**Website:** https://www.boole.eu / https://wooddesigner.org
**Target Market:** Professional cabinet makers, furniture manufacturers, DIY enthusiasts
**SketchUp Integration:** PARTIAL - DXF models can be loaded as SketchUp components

#### Features:
- Parametric furniture design (cabinets auto-update on resize)
- L-shaped and corner cabinets, free-form designs
- Auto-apply hardware and assembly libraries
- Cut lists, plans of each part
- Cutting and nesting maps (waste minimization)
- 3D renders
- Costs and material usage reports
- CNC file generation

#### Export Formats:
- DXF (for SketchUp import and CNC)
- CNC files (various formats)
- PDF reports
- CSV cut lists

#### Pricing:
- $1,995 to $2,645 (one-time license, varies by modules)
- Used in 100+ countries worldwide

#### Construction Types:
- Frameless (European) primary focus
- Face frame supported
- Multiple joint types

#### Strengths:
- Powerful parametric engine
- Fast design-to-production pipeline
- Comprehensive hardware libraries
- Good nesting/optimization
- One-time license (no subscription)

#### Weaknesses:
- Not a SketchUp plugin (separate software)
- SketchUp integration is limited to DXF import/export
- Interface less modern than competitors
- European-centric (may lack Brazilian construction specifics)

---

### 1.4 CabinetVision (by Hexagon)
**Website:** https://www.cabinetvision.com
**Target Market:** Professional/industrial cabinet and closet manufacturers
**SketchUp Integration:** YES - import SketchUp models via dedicated button

#### Features:
- Complete design-to-manufacturing solution
- Automatic G-code generation for CNC
- Support for flat table routers, point-to-point, panel saws, drill/dowel machines
- Advanced nesting optimization (2025.4 update)
- Photorealistic rendering (2025 update)
- Region-specific material libraries (US supplier standards)
- Modular architecture (2D CAD, S2M Center, etc.)
- Screen-to-Machine (S2M) automation

#### Export Formats:
- G-code (for wide variety of CNC machinery)
- DXF
- PDF shop drawings
- CSV

#### Pricing:
- Enterprise-level pricing (not publicly listed)
- Modular - pay for what you need
- Considered expensive for small shops

#### Construction Types:
- Face frame and frameless
- Full closet systems
- Custom millwork

#### Strengths:
- Industry standard for large cabinet shops
- Most comprehensive CNC integration
- S2M Center is extremely powerful
- Strong support from Hexagon (large company)
- Regular updates (2025.4 has new CNC features)

#### Weaknesses:
- Very expensive
- Steep learning curve
- SketchUp import is one-way (cannot round-trip)
- Overkill for small shops
- Windows only

---

### 1.5 KCD Software
**Website:** https://kcdsoftware.com
**Target Market:** Small to mid-size custom cabinet and closet shops
**SketchUp Integration:** NO - standalone software

#### Features:
- 2D and 3D parametric design for kitchen, bath, closet
- Hundreds of editable door styles
- Face frame, frameless, and closet libraries
- Cut list generation with material optimization
- Nesting for CNC
- 3D renders and walkthroughs
- Pricing and estimating
- Countertop edge profilers

#### Export Formats:
- G-code for CNC
- CSV cut lists
- PDF drawings
- DXF

#### Pricing:
| Option | Price |
|--------|-------|
| Monthly rental | Starting at $95/month |
| Purchase outright | Available (price varies by version) |

Multiple tiers: Cabinet/Closet Designer vs. Cabinet/Closet Professional

#### Strengths:
- Significant time savings (8hrs to 2hrs for kitchen design)
- Good balance of features vs. price
- Strong cut list and production output
- Competitive for small/mid shops

#### Weaknesses:
- No SketchUp integration
- Standalone software with its own learning curve
- Less flexible for custom/non-cabinet furniture

---

### 1.6 SketchList 3D
**Website:** https://sketchlist.com
**Target Market:** Hobbyist to professional woodworkers
**SketchUp Integration:** NO - standalone competitor to SketchUp

#### Features:
- Woodworking-specific 3D modeling
- Board-based design (understands wood as boards)
- Automatic cut lists from model
- Shapes, contours, and joinery tools
- Virtual walk-throughs
- Cost estimation
- Material textures
- CNC compatibility

#### Export Formats:
- CSV cut lists
- DXF for CNC
- Print-ready reports
- 3D renderings

#### Pricing:
| Plan | Price |
|------|-------|
| Hobby | ~$250 one-time |
| Pro | ~$875 one-time |
| 1-Year Subscription | $599.99/year |
| Monthly | Available |

*Perpetual licenses available without updates; subscription includes maintenance*

#### Strengths:
- Purpose-built for woodworking (not general 3D)
- Intuitive board-based approach
- Tightly integrated reporting/cut lists
- Both subscription and perpetual options

#### Weaknesses:
- Not a SketchUp plugin (direct competitor)
- Smaller community than SketchUp ecosystem
- Learning curve for sophisticated features
- Mixed user reviews

---

### 1.7 CabWriter
**Website:** https://cabwritersoftware.com
**Target Market:** Small to mid-size cabinet shops
**SketchUp Integration:** YES - SketchUp extension

#### Features:
- Story stick technology
- Face frame, frameless, or hybrid construction
- Joinery: butt, through/blind dado, rabbet, qualified tenon, captured backs
- Cope and stick, raised panel, flat panel, slab doors
- Sheet good optimization with DXF output
- Automatic texturing
- Label printing (Avery 5160/5163)
- Auto section/elevation/plan views
- LayOut integration with automatic hatching

#### Export Formats:
- CSV / tab-delimited (Excel compatible)
- CutList Plus fx compatible
- DXF (for CNC)
- SketchUp LayOut documents

#### Pricing:
| Edition | Price |
|---------|-------|
| 2 Seats | $650 |
| 3-5 Seats | $1,025 |
| 6-8 Seats | $1,350 |

*Permanent license, NOT subscription. 1 year free support, renewable at $120/yr*

#### Strengths:
- Permanent license model
- Deep SketchUp integration
- Comprehensive construction options
- Good shop drawing output via LayOut
- Affordable for small shops

#### Weaknesses:
- CNC export requires CabWriter CNC add-on
- DXF optimization less sophisticated than Mozaik
- Smaller development team

---

### 1.8 ArchiWood
**Website:** https://archiwood.github.io
**Target Market:** Cabinet manufacturers, custom furniture studios, factories
**SketchUp Integration:** YES - second-layer development on SketchUp

#### Features:
- Full parametric cabinet system on SketchUp
- Multiple hardware/connection systems:
  - Cam-lock/dowel
  - Hidden connectors
  - Lamello
  - Mortise-and-tenon
  - Mixed workflows
- Automatic mortise and slot generation per hardware brand
- Batch handle placement
- Edge banding specifications in production logic
- Grain direction tracking in nesting
- Error detection before CNC release
- QR codes and barcodes for labels
- Room geometry scanning (auto-suggests modules)
- Color-coded anomaly detection

#### Export Formats:
- CNC programs (format not specified)
- Nesting layouts
- Panel lists
- Labels with QR/barcodes

#### Pricing:
- NOT publicly disclosed (contact sales)

#### Strengths:
- Most comprehensive SketchUp-based cabinet solution
- "What-you-see-is-what-you-cut" principle
- Error detection before CNC release
- Smart room scanning
- Deep hardware brand integration

#### Weaknesses:
- Chinese-origin (support in Chinese/English only)
- Pricing not transparent
- Smaller user base in Western markets
- Limited documentation in English

---

### 1.9 CabMaker32 (GKWare)
**Website:** https://cabmaker32.com
**Target Market:** Small to mid-size cabinet shops
**SketchUp Integration:** YES - SketchUp extension

#### Features:
- 32mm (European) cabinet system
- Doors and drawers that open/close
- Adjustable shelving, vertical dividers, pullouts
- Custom libraries
- Door handles, edge treatments, custom profiles
- 6 spreadsheet reports
- CutMaster optimizer integration

#### Export Formats:
- CutList Plus compatible
- CutMaster format
- DXF (via CutMaster Plus)
- CSV spreadsheets

#### Pricing:
| Product | Price |
|---------|-------|
| CabMaker v11 Design | $149 |
| CabMaker Build v11 | $219 |
| CutMaster Plus v11 | $197 |

#### Strengths:
- Very affordable
- Good for 32mm (European) system
- Works well with VCarve for CNC
- Uses groups (better for large projects)

#### Weaknesses:
- 32mm system may not suit all construction methods
- CNC requires separate CutMaster Plus purchase
- Less modern interface
- Questionable ongoing support (users have asked if still operating)

---

### 1.10 Microvellum
**Website:** https://www.microvellum.com
**Target Market:** Industrial/enterprise cabinet and millwork manufacturers
**SketchUp Integration:** LIMITED - file import/export compatibility

#### Features:
- Based on AutoCAD platform
- Complete design-to-manufacturing automation
- Parametric design and engineering
- CNC machine code generation
- Detailed cost estimates (material, hardware, labor, overhead)
- Nesting reports
- SketchUp/AutoCAD/SolidWorks file compatibility

#### Pricing:
- Annual subscription (monthly or yearly payments)
- Enterprise-level pricing (expensive)

#### Strengths:
- Most powerful for complex custom projects
- Advanced 3D for intricate shapes/curves
- Full manufacturing automation
- Enterprise-grade

#### Weaknesses:
- Built on AutoCAD (steep learning curve)
- Most expensive option
- Overkill for small shops
- Not a SketchUp plugin

---

### 1.11 Pro100
**Website:** https://www.pro100usa.com
**Target Market:** Professional cabinet makers and kitchen dealers
**SketchUp Integration:** NO - standalone competitor

#### Features:
- Drag-and-drop interface
- Real-time 3D rendering with lighting/shadows
- Frame and frameless cabinets
- Instant job costing
- Cut list generation (Excel export)
- Manufacturer-specific door styles, hardware, finishes
- 3D replicas with integrated pricing

#### Pricing:
- $2,549.99 one-time (perpetual license)

#### Strengths:
- Easy to learn
- Good 3D rendering
- Integrated pricing
- No subscription

#### Weaknesses:
- High upfront cost
- No SketchUp integration
- Limited CNC features compared to Mozaik/CabinetVision

---

### 1.12 ProKitchen
**Website:** https://www.prokitchensoftware.com
**Target Market:** Kitchen dealers, designers, showrooms
**SketchUp Integration:** NO - standalone software

#### Features:
- Manufacturer catalog integration (real products)
- 360 panoramas and HD renderings
- Photorealistic visualization
- Automatic parts/pieces list from manufacturer catalogs
- Instant quoting

#### Strengths:
- Best for kitchen dealers working with specific manufacturers
- Excellent rendering quality

#### Weaknesses:
- Tied to manufacturer catalogs (not custom cabinets)
- No SketchUp integration
- No CNC output
- Not for custom woodworking

---

### 1.13 Cabinet Pro
**Website:** https://www.cabinetpro.com
**Target Market:** Small to mid-size cabinet shops
**SketchUp Integration:** NO - standalone

#### Features:
- Face frame and frameless, unlimited setups
- Dowel, blind dado, or custom construction
- Smart CNC processing
- Lockdowel, Rafix connector support
- 3-axis and 5-axis router support
- Auto tool selection for dado/rabbet cuts
- Customized batch cutlist reports
- Edgebanding reports
- Panel optimization

#### Pricing:
- "Most affordable in its class" (exact pricing not public)

---

## 2. FREE/COMMUNITY PLUGINS

### 2.1 OpenCutList (THE dominant free plugin)
**Website:** https://docs.opencutlist.org
**GitHub:** https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension
**Current Version:** 7.0.0
**License:** Open Source (Free)

#### Features:
- **Parts List**: Automatic generation sorted by material
- **Material Types**: Solid Wood, Sheet Goods, Edge Banding, Dimensional Lumber
- **Cutting Diagrams**: 1D (bars) and 2D (panels) optimization
- **Edge Banding**: Full support with visual indicators, painting edges
- **Labels**: Printable labels with customizable info
- **Cost & Weight Estimates**: Material costs and weight calculation
- **Exploded Views**: Part separation visualization
- **Smart Export Tool**:
  - STL and OBJ (3D polygon mesh)
  - SVG and DXF (2D projections)
  - DXF with layer/block structure options
  - Curve detection (circles, ellipses, arcs)
- **CSV/XLSX Export**: Parts lists for spreadsheets
- **Units**: Works with both metric and imperial/fractional inches
- **Grain Direction**: Tracks and displays in cutting diagrams
- **Part Oversize/Trimming**: Configurable allowances

#### What It Does NOT Do:
- No parametric cabinet design
- No hardware insertion
- No automatic joinery
- No G-code generation (DXF must go through CAM)
- No assembly automation

#### Strengths:
- Completely free and open source
- Most actively maintained woodworking plugin
- Excellent community (L'Air du Bois, French woodworking platform)
- Works with SketchUp 2017+
- Regular updates (7.0.0 just released)
- Multi-language support
- Best-in-class cutting diagram optimization for free software

#### Weaknesses:
- No parametric design capability
- No CNC tool path generation
- No hardware/connector automation
- Requires manual modeling in SketchUp

---

### 2.2 CutList Bridge
**Website:** http://www.srww.com/my_plugins/cutlist_bridge.html
**Price:** Free (bridges to CutList Plus fx which is paid)

#### Features:
- Extends SketchUp component attributes for woodworking
- Material type, species, dimensions, shop method tags, sub-assembly
- Export to .cwx file (CutList Plus fx 12.3+)
- Export to CSV for spreadsheets

#### Status: Active but primarily a bridge to paid CutList Plus fx software

---

### 2.3 Cutlister (Abandoned)
**GitHub:** https://github.com/danawoodman/Google-Sketchup-Cutlister-Plugin
**Price:** Free, Open Source
**Status:** NOT MAINTAINED

#### Features:
- HTML, CSV, label (Avery 5366) output
- Sheet goods, solid stock, hardware classification
- Select specific cabinets or whole model

---

### 2.4 K2WS_Tools (Joinery Plugin)
**Source:** SketchUcation Plugin Store
**Price:** Free

#### Features:
- Real furniture joints:
  - Mortise & Tenon
  - Loose Tenon
  - Biscuits
  - Dowels
  - Domino function
  - Box Joints
  - Dovetails
  - Screw Holes
  - Pocket Screw Holes

---

### 2.5 Other Free/Community Tools

| Plugin | Purpose | Source |
|--------|---------|--------|
| **SketchUp STL** | Export STL for CNC | Extension Warehouse |
| **FredoScale** | Scale, stretch, twist, deform objects | SketchUcation |
| **Joint Push/Pull** | Create joinery by pushing/pulling faces | Extension Warehouse |
| **Wudworx M&T** | Mortise & Tenon joints | SketchUcation |
| **3D Warehouse Components** | Free hinges, drawers, handles, etc. | 3D Warehouse |

---

## 3. DYNAMIC COMPONENTS DEEP DIVE

### 3.1 Built-in DC Limitations

1. **Pro Only**: Dynamic Components only available in SketchUp Pro (not Free/Web)
2. **No Ruby Script Calls**: Cannot call Ruby Scripts as functions inside DC formulas
3. **Only Groups/Components**: Only groups and components can have transformation properties
4. **No Object Relationships**: DCs cannot detect what they're glued to, connected to, or contained within
5. **Layout Incompatibility**: DCs do not function in SketchUp LayOut
6. **Multiple Definitions**: Each DC iteration creates separate component definitions (clutter)
7. **Nesting Is Cumbersome**: Deep nesting works but is restrictive
8. **Scale vs Parametric Conflict**: If parametric size-editable, scale tool input on same axis is ignored
9. **Complexity Barrier**: "Too complex for most users, even spreadsheet experts"
10. **Limited Interface**: No custom UI - only the Component Options dialog
11. **No External Data**: Cannot read from databases, files, or web services
12. **Performance**: Complex DCs with many nested components become very slow

### 3.2 DC Formula Capabilities

- Mathematical operators (+, -, *, /)
- CHOOSE function (select from options)
- IF/AND/OR logical functions
- NEAREST/ROUND for snapping
- ANIMATE for motion (drawer opening, door swing)
- HIDDEN for conditional visibility
- CURRENT function for referencing
- String functions (limited)
- LARGEST/SMALLEST for constraints

### 3.3 How Advanced Plugins Work Around DC Limitations

| Plugin | Approach |
|--------|----------|
| **Mozaik** | Own proprietary parametric engine; uses SketchUp only for rendering |
| **CabinetSense** | Own parametric engine running as SketchUp extension |
| **ArchiWood** | Second-layer on SketchUp with own parametric system |
| **CabWriter** | Story stick technology + own library system |
| **CabMaker32** | Uses SketchUp groups (not components) for better performance |
| **OpenCutList** | Does not do parametric; reads existing geometry only |

**Key insight**: NO major woodworking plugin relies on SketchUp's built-in DC system for parametric cabinet design. They all create their own parametric engines.

### 3.4 Live Components (Newer Alternative)

- Parametric objects from 3D Warehouse
- Web-based (Trimble Parametric Engine)
- Cannot be authored by users (yet)
- Paintable since SketchUp 2025
- More limited than DCs in customizability
- Not suitable for production cabinet design

### 3.5 Best Practices for Parametric Furniture

1. Use clear, structured naming conventions
2. Group nested elements before adding logic
3. Test parameters incrementally
4. Keep units consistent
5. Use wrapper components for complex assemblies
6. Minimize deep nesting for performance
7. Consider OpenCutList-compatible material naming
8. Use component axes for CAM orientation

---

## 4. INDUSTRY TRENDS & MARKET GAPS

### 4.1 User Requests & Pain Points

1. **Parametric design in SketchUp** - users increasingly migrating to Fusion 360 for this
2. **Direct CNC from SketchUp** - gap between design and manufacturing output
3. **Edge banding automation** - only ArchiWood and OpenCutList handle this well
4. **Hardware libraries** - users want brand-specific hardware (Blum, Hettich, Hafele)
5. **Nesting optimization** - critical for material cost savings
6. **Brazilian/regional construction methods** - virtually no software addresses this
7. **Integrated workflow** - design-to-CNC without multiple software purchases
8. **Cloud collaboration** - remote access and team sharing

### 4.2 Market Gaps

| Gap | Current State |
|-----|--------------|
| **Brazilian construction methods** | NO software specifically addresses Brazilian marcenaria construction (minifix/cavilha, kit moveis planejados) |
| **SketchUp-native full pipeline** | No single plugin does design + nesting + CNC G-code inside SketchUp |
| **Affordable CNC integration** | Mozaik ($225/mo) is cheapest full CNC; huge gap between free (OpenCutList) and paid |
| **JSON/API export** | No woodworking plugin exports JSON natively; all use CSV/DXF/G-code |
| **Cloud-based nesting** | Nesting runs locally in all products; cloud optimization emerging but not in SketchUp plugins |
| **Real-time collaboration** | No SketchUp woodworking plugin supports multi-user design |
| **Hardware brand catalogs** | Most plugins have generic hardware; real brand catalogs rare |
| **Edge banding automation** | Only OpenCutList and ArchiWood handle edge banding comprehensively |
| **Integrated costing** | Few plugins connect material costs to purchase/inventory |
| **Mobile/tablet design** | No woodworking plugin works on SketchUp for iPad |

### 4.3 Industry 4.0 / IoT Trends

- **AI integration**: CNC machines gaining AI for predictive maintenance and optimization
- **Cloud connectivity**: Smart CNC tools with cloud monitoring gaining popularity
- **Real-time tracking**: IoT sensors on CNC machines for production monitoring
- **Automated material optimization**: AI-driven nesting algorithms
- **Digital twin**: Models that update from machine feedback
- **Hybrid manufacturing**: CNC + robotics integration
- **Woodworking CNC market**: Growing at 4.06% CAGR (2025-2033)

### 4.4 Cloud vs Local Processing

| Aspect | Current | Trend |
|--------|---------|-------|
| Design | Mostly local (SketchUp desktop) | SketchUp Web gaining features |
| Nesting | 100% local | Cloud APIs emerging |
| CNC output | 100% local | Edge computing at machine |
| Collaboration | File sharing | Cloud platforms (INNERGY) |
| Rendering | Local | Cloud rendering available |

---

## 5. COMPETITIVE MATRIX

### Feature Comparison Matrix

| Plugin | SketchUp Plugin? | Parametric | Cut List | Nesting | CNC G-code | Edge Banding | Hardware Auto | Price Range |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|--------|
| **OpenCutList** | YES | NO | YES | YES (2D) | NO (DXF only) | YES | NO | FREE |
| **CabinetSense** | YES | YES | YES | YES | NO (DXF) | Partial | YES | $25/mo |
| **CabWriter** | YES | YES | YES | YES (sheet) | NO (DXF) | NO | Partial | $650+ one-time |
| **ArchiWood** | YES | YES | YES | YES | YES | YES | YES | Contact sales |
| **CabMaker32** | YES | Partial | YES | YES (CutMaster) | YES (DXF/CNC) | YES | Partial | $149-$565 |
| **Mozaik** | Partial | YES | YES | YES | YES (175+ post) | YES | YES | $125-$325/mo |
| **CabinetVision** | Import only | YES | YES | YES | YES | YES | YES | Enterprise $$ |
| **Microvellum** | Import only | YES | YES | YES | YES | YES | YES | Enterprise $$$ |
| **Polyboard** | DXF only | YES | YES | YES | YES | YES | YES | $1,995-$2,645 |
| **SketchList 3D** | NO | YES | YES | NO | Partial | NO | NO | $250-$875 |
| **KCD Software** | NO | YES | YES | YES | YES | YES | YES | $95/mo+ |
| **Pro100** | NO | YES | YES | Partial | NO | NO | YES | $2,550 |
| **ProKitchen** | NO | Catalog | YES | NO | NO | NO | Catalog | Subscription |
| **Cabinet Pro** | NO | YES | YES | YES | YES | YES | YES | "Affordable" |

### Construction Type Support

| Plugin | Face Frame | Frameless/Euro | Hybrid | 32mm System | Brazilian |
|--------|:-:|:-:|:-:|:-:|:-:|
| **Mozaik** | YES | YES | YES | YES | NO |
| **CabinetSense** | YES | YES | - | YES | NO |
| **CabWriter** | YES | YES | YES | - | NO |
| **ArchiWood** | - | YES | - | YES | NO |
| **CabinetVision** | YES | YES | YES | YES | NO |
| **Polyboard** | YES | YES | - | YES | NO |

**Critical finding: NO software specifically addresses Brazilian construction methods.**

### Export Format Support

| Plugin | CSV | DXF | SVG | G-code | STL | OBJ | JSON | XML/CWX |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **OpenCutList** | YES | YES | YES | NO | YES | YES | NO | NO |
| **CabinetSense** | YES | YES | - | NO | - | - | NO | - |
| **CabWriter** | YES | YES | - | NO | - | - | NO | YES (CutList+) |
| **ArchiWood** | YES | - | - | YES | - | - | NO | - |
| **Mozaik** | YES | YES | - | YES | - | - | NO | - |
| **CabinetVision** | YES | YES | - | YES | - | - | NO | - |
| **OpenCutList** exports | YES | YES | YES | NO | YES | YES | NO | NO |

---

## KEY TAKEAWAYS FOR COMPETITIVE ANALYSIS

1. **OpenCutList dominates free space** - no viable free competitor; it's the de facto standard
2. **No plugin does everything inside SketchUp** - always requires external CAM for full CNC
3. **ArchiWood is the most complete SketchUp-native solution** but has limited Western market presence
4. **JSON export is a completely unserved niche** - every plugin uses CSV/DXF
5. **Brazilian construction methods are entirely unserved** - massive opportunity
6. **The $25-$125/mo range has limited competition** between CabinetSense and Mozaik
7. **Cloud-based optimization doesn't exist** in the SketchUp plugin ecosystem
8. **Edge banding + nesting + CNC in one free tool** does not exist
9. **Users are migrating from SketchUp to Fusion 360** for better parametric design
10. **No plugin exports structured data (JSON/API)** suitable for ERP/MES integration

---

## Sources

- [OpenCutList Documentation](https://docs.opencutlist.org/)
- [OpenCutList GitHub](https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension)
- [Mozaik Software Products](https://www.mozaiksoftware.com/mozaik-products)
- [CabinetSense Software](https://www.cabinetsensesoftware.com/)
- [CabWriter Pro](https://cabwritersoftware.com/cabwriter-pro/)
- [ArchiWood](https://archiwood.github.io/)
- [Polyboard / WoodDesigner](https://wooddesigner.org/polyboard-software-tools/)
- [CabinetVision / Hexagon](https://www.cabinetvision.com/)
- [KCD Software](https://kcdsoftware.com/)
- [SketchList 3D](https://sketchlist.com/)
- [CabMaker32](https://cabmaker32.com/products/)
- [Microvellum](https://www.microvellum.com)
- [Pro100 USA](https://www.pro100usa.com/)
- [ProKitchen Software](https://www.prokitchensoftware.com/)
- [Cabinet Pro](https://www.cabinetpro.com/)
- [SketchUp Extension Warehouse - Woodworking](https://extensions.sketchup.com/search/?q=&category=Woodworking)
- [SketchUcation Plugin Store](https://sketchucation.com/pluginstore)
- [SketchUp Community Forums](https://forums.sketchup.com/)
- [SketchUp DC Limitations Forum](https://forums.sketchup.com/t/main-limitations-of-dynamic-components/21708)
- [SketchUp to CNC Forum Discussion](https://forums.sketchup.com/t/sketchup-to-cnc-vcarve-mozaik-cabinetsense-dynamic-components-parametric/104455)
- [Fusion 360 vs SketchUp 2025](https://productdesignonline.com/fusion-360-vs-sketchup-for-woodworking-2025-comparison/)
- [Woodworking CNC Market Forecast](https://www.globalgrowthinsights.com/market-reports/woodworking-cnc-tools-market-110691)
- [Woodshop News - Choosing CNC Software](https://www.woodshopnews.com/features/choosing-cnc-software)
- [A2Z Millwork - Top Features Cabinet Vision 2025](https://a2zmillwork.com/blog/top-features-in-cabinet-vision-2025-you-should-use-for-technical-drafting/)
- [Woodworking Design Software Comparison](https://wooddesigner.org/woodworking-design-software-comparison/)
