/**
 * Morphicons Standalone Web Bundle (https://www.morphicons.com/)
 * Powered by Morphicons + Lucide Icons (Tuned for fluid visible transitions)
 */
(function (global) {
    'use strict';

    const ICONS = {
  "Aperture": {
    "raw": [
      ["circle", { "cx": "12", "cy": "12", "r": "10" }],
      ["path", { "d": "m14.31 8 5.74 9.94" }],
      ["path", { "d": "M9.69 8h11.48" }],
      ["path", { "d": "m7.38 12 5.74-9.94" }],
      ["path", { "d": "M9.69 16 3.95 6.06" }],
      ["path", { "d": "M14.31 16H2.83" }],
      ["path", { "d": "m16.62 12-5.74 9.94" }]
    ],
    "d": "M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM14.31 8L20.05 17.94M9.69 8H21.17M7.38 12L13.12 2.06M9.69 16L3.95 6.06M14.31 16H2.83M16.62 12L10.88 21.94"
  },
  "ArrowUp": {
    "raw": [
      [
        "path",
        {
          "d": "m5 12 7-7 7 7"
        }
      ],
      [
        "path",
        {
          "d": "M12 19V5"
        }
      ]
    ],
    "d": "M5 12C7.3333 9.6667 9.6667 7.3333 12 5C14.3333 7.3333 16.6667 9.6667 19 12M12 19C12 14.3333 12 9.6667 12 5"
  },
  "Square": {
    "raw": [
      [
        "rect",
        {
          "x": "5",
          "y": "5",
          "width": "14",
          "height": "14",
          "rx": "3"
        }
      ]
    ],
    "d": "M8 5C10.6667 5 13.3333 5 16 5C17.6569 5 19 6.3431 19 8C19 10.6667 19 13.3333 19 16C19 17.6569 17.6569 19 16 19C13.3333 19 10.6667 19 8 19C6.3431 19 5 17.6569 5 16C5 13.3333 5 10.6667 5 8C5 6.3431 6.3431 5 8 5Z"
  },
  "Circle": {
    "raw": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ]
    ],
    "d": "M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
  },
  "User": {
    "raw": [
      ["path", { "d": "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }],
      ["circle", { "cx": "12", "cy": "7", "r": "4" }]
    ],
    "d": "M19 21V19C19 16.7909 17.2091 15 15 15H9C6.79086 15 5 16.7909 5 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z"
  },
  "Users": {
    "raw": [
      ["path", { "d": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
      ["circle", { "cx": "9", "cy": "7", "r": "4" }],
      ["path", { "d": "M22 21v-2a4 4 0 0 0-3-3.87" }],
      ["path", { "d": "M16 3.13a4 4 0 0 1 0 7.75" }]
    ],
    "d": "M16 21V19C16 16.7909 14.2091 15 12 15H6C3.79086 15 2 16.7909 2 19V21M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7ZM22 21V19C22 17.0645 20.6224 15.451 18.7758 15.0805M16 3.13C17.7681 3.79468 19 5.50974 19 7.5C19 9.49026 17.7681 11.2053 16 11.87"
  },
  "Repeat": {
    "raw": [
      ["path", { "d": "m17 2 4 4-4 4" }],
      ["path", { "d": "M3 11v-1a4 4 0 0 1 4-4h14" }],
      ["path", { "d": "m7 22-4-4 4-4" }],
      ["path", { "d": "M21 13v1a4 4 0 0 1-4 4H3" }]
    ],
    "d": "M17 2L21 6L17 10M3 11V10C3 7.79086 4.79086 6 7 6H21M7 22L3 18L7 14M21 13V14C21 16.2091 19.2091 18 17 18H3"
  },
  "Mic": {
    "raw": [
      [
        "path",
        {
          "d": "M12 19v3"
        }
      ],
      [
        "path",
        {
          "d": "M19 10v2a7 7 0 0 1-14 0v-2"
        }
      ],
      [
        "rect",
        {
          "x": "9",
          "y": "2",
          "width": "6",
          "height": "13",
          "rx": "3"
        }
      ]
    ],
    "d": "M12 19C12 20 12 21 12 22M19 10C19 10.6667 19 11.3333 19 12C19 15.866 15.866 19 12 19C8.134 19 5 15.866 5 12C5 11.3333 5 10.6667 5 10M12 2C13.6569 2 15 3.3431 15 5C15 7.3333 15 9.6667 15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 9.6667 9 7.3333 9 5C9 3.3431 10.3431 2 12 2Z"
  },
  "MicOff": {
    "raw": [
      [
        "path",
        {
          "d": "M12 19v3"
        }
      ],
      [
        "path",
        {
          "d": "M15 9.34V5a3 3 0 0 0-5.68-1.33"
        }
      ],
      [
        "path",
        {
          "d": "M16.95 16.95A7 7 0 0 1 5 12v-2"
        }
      ],
      [
        "path",
        {
          "d": "M18.89 13.23A7 7 0 0 0 19 12v-2"
        }
      ],
      [
        "path",
        {
          "d": "m2 2 20 20"
        }
      ],
      [
        "path",
        {
          "d": "M9 9v3a3 3 0 0 0 5.12 2.12"
        }
      ]
    ],
    "d": "M12 19C12 20 12 21 12 22M15 9.34C15 7.8933 15 6.4467 15 5C14.9916 3.6134 14.0341 2.4132 12.684 2.0971C11.3339 1.781 9.9431 2.4313 9.32 3.67M16.95 16.95C14.948 18.9522 11.937 19.5512 9.3211 18.4676C6.7053 17.3841 4.9998 14.8314 5 12C5 11.3333 5 10.6667 5 10M18.89 13.23C18.9628 12.824 18.9996 12.4124 19 12C19 11.3333 19 10.6667 19 10M2 2C8.6667 8.6667 15.3333 15.3333 22 22M9 9C9 10 9 11 9 12C9.0011 13.2126 9.732 14.3053 10.8523 14.7691C11.9726 15.233 13.2621 14.9769 14.12 14.12"
  },
  "Copy": {
    "raw": [
      [
        "rect",
        {
          "width": "14",
          "height": "14",
          "x": "8",
          "y": "8",
          "rx": "2",
          "ry": "2"
        }
      ],
      [
        "path",
        {
          "d": "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
        }
      ]
    ],
    "d": "M10 8C13.3333 8 16.6667 8 20 8C21.1046 8 22 8.8954 22 10C22 13.3333 22 16.6667 22 20C22 21.1046 21.1046 22 20 22C16.6667 22 13.3333 22 10 22C8.8954 22 8 21.1046 8 20C8 16.6667 8 13.3333 8 10C8 8.8954 8.8954 8 10 8ZM4 16C2.9 16 2 15.1 2 14C2 10.6667 2 7.3333 2 4C2 2.9 2.9 2 4 2C7.3333 2 10.6667 2 14 2C15.1 2 16 2.9 16 4"
  },
  "Check": {
    "raw": [
      [
        "path",
        {
          "d": "M20 6 9 17l-5-5"
        }
      ]
    ],
    "d": "M20 6C16.3333 9.6667 12.6667 13.3333 9 17C7.3333 15.3333 5.6667 13.6667 4 12"
  },
  "RotateCcw": {
    "raw": [
      [
        "path",
        {
          "d": "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
        }
      ],
      [
        "path",
        {
          "d": "M3 3v5h5"
        }
      ]
    ],
    "d": "M3 12C3 16.9706 7.0294 21 12 21C16.9706 21 21 16.9706 21 12C21 7.0294 16.9706 3 12 3C9.484 3.0095 7.069 3.9912 5.26 5.74C4.5067 6.4933 3.7533 7.2467 3 8M3 3C3 4.6667 3 6.3333 3 8C4.6667 8 6.3333 8 8 8"
  },
  "RefreshCw": {
    "raw": [
      [
        "path",
        {
          "d": "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"
        }
      ],
      [
        "path",
        {
          "d": "M21 3v5h-5"
        }
      ],
      [
        "path",
        {
          "d": "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"
        }
      ],
      [
        "path",
        {
          "d": "M8 16H3v5"
        }
      ]
    ],
    "d": "M3 12C3 7.0294 7.0294 3 12 3C14.516 3.0095 16.931 3.9912 18.74 5.74C19.4933 6.4933 20.2467 7.2467 21 8M21 3C21 4.6667 21 6.3333 21 8C19.3333 8 17.6667 8 16 8M21 12C21 16.9706 16.9706 21 12 21C9.484 20.9905 7.069 20.0088 5.26 18.26C4.5067 17.5067 3.7533 16.7533 3 16M8 16C6.3333 16 4.6667 16 3 16C3 17.6667 3 19.3333 3 21"
  },
  "ThumbsUp": {
    "raw": [
      [
        "path",
        {
          "d": "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"
        }
      ],
      [
        "path",
        {
          "d": "M7 10v12"
        }
      ]
    ],
    "d": "M15 5.88C14.6667 7.2533 14.3333 8.6267 14 10C15.9433 10 17.8867 10 19.83 10C20.4595 10 21.0523 10.2964 21.43 10.8C21.8077 11.3036 21.9263 11.9557 21.75 12.56C20.9733 15.2267 20.1967 17.8933 19.42 20.56C19.1711 21.4133 18.3889 22 17.5 22C13 22 8.5 22 4 22C2.8954 22 2 21.1046 2 20C2 17.3333 2 14.6667 2 12C2 10.8954 2.8954 10 4 10C4.92 10 5.84 10 6.76 10C7.5189 9.9996 8.2123 9.5697 8.55 8.89C9.7 6.5933 10.85 4.2967 12 2C12.9554 2.0118 13.853 2.4594 14.4374 3.2152C15.0218 3.971 15.229 4.9524 15 5.88ZM7 10C7 14 7 18 7 22"
  },
  "ThumbsDown": {
    "raw": [
      [
        "path",
        {
          "d": "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"
        }
      ],
      [
        "path",
        {
          "d": "M17 14V2"
        }
      ]
    ],
    "d": "M9 18.12C9.3333 16.7467 9.6667 15.3733 10 14C8.0567 14 6.1133 14 4.17 14C3.5405 14 2.9477 13.7036 2.57 13.2C2.1923 12.6964 2.0737 12.0443 2.25 11.44C3.0267 8.7733 3.8033 6.1067 4.58 3.44C4.8289 2.5867 5.6111 2 6.5 2C11 2 15.5 2 20 2C21.1046 2 22 2.8954 22 4C22 6.6667 22 9.3333 22 12C22 13.1046 21.1046 14 20 14C19.08 14 18.16 14 17.24 14C16.4811 14.0004 15.7877 14.4303 15.45 15.11C14.3 17.4067 13.15 19.7033 12 22C11.0446 21.9882 10.147 21.5406 9.5626 20.7848C8.9782 20.029 8.771 19.0476 9 18.12ZM17 14C17 10 17 6 17 2"
  },
  "Pencil": {
    "raw": [
      [
        "path",
        {
          "d": "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
        }
      ],
      [
        "path",
        {
          "d": "m15 5 4 4"
        }
      ]
    ],
    "d": "M21.174 6.812C22.275 5.7113 22.2752 3.9265 21.1745 2.8255C20.0738 1.7245 18.289 1.7243 17.188 2.825C12.7393 7.2747 8.2907 11.7243 3.842 16.174C3.6098 16.4055 3.4381 16.6905 3.342 17.004C2.9017 18.4547 2.4613 19.9053 2.021 21.356C1.9683 21.5322 2.0167 21.7231 2.1468 21.853C2.2769 21.9829 2.4679 22.0309 2.644 21.978C4.095 21.538 5.546 21.098 6.997 20.658C7.3102 20.5628 7.5952 20.3921 7.827 20.161C12.276 15.7113 16.725 11.2617 21.174 6.812ZM15 5C16.3333 6.3333 17.6667 7.6667 19 9"
  },
  "Plus": {
    "raw": [
      [
        "path",
        {
          "d": "M5 12h14"
        }
      ],
      [
        "path",
        {
          "d": "M12 5v14"
        }
      ]
    ],
    "d": "M5 12C9.6667 12 14.3333 12 19 12M12 5C12 9.6667 12 14.3333 12 19"
  },
  "X": {
    "raw": [
      [
        "path",
        {
          "d": "M18 6 6 18"
        }
      ],
      [
        "path",
        {
          "d": "m6 6 12 12"
        }
      ]
    ],
    "d": "M18 6C14 10 10 14 6 18M6 6C10 10 14 14 18 18"
  },
  "Trash2": {
    "raw": [
      [
        "path",
        {
          "d": "M10 11v6"
        }
      ],
      [
        "path",
        {
          "d": "M14 11v6"
        }
      ],
      [
        "path",
        {
          "d": "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
        }
      ],
      [
        "path",
        {
          "d": "M3 6h18"
        }
      ],
      [
        "path",
        {
          "d": "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        }
      ]
    ],
    "d": "M10 11C10 13 10 15 10 17M14 11C14 13 14 15 14 17M19 6C19 10.6667 19 15.3333 19 20C19 21.1046 18.1046 22 17 22C13.6667 22 10.3333 22 7 22C5.8954 22 5 21.1046 5 20C5 15.3333 5 10.6667 5 6M3 6C9 6 15 6 21 6M8 6C8 5.3333 8 4.6667 8 4C8 2.8954 8.8954 2 10 2C11.3333 2 12.6667 2 14 2C15.1046 2 16 2.8954 16 4C16 4.6667 16 5.3333 16 6"
  },
  "Download": {
    "raw": [
      [
        "path",
        {
          "d": "M12 15V3"
        }
      ],
      [
        "path",
        {
          "d": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        }
      ],
      [
        "path",
        {
          "d": "m7 10 5 5 5-5"
        }
      ]
    ],
    "d": "M12 15C12 11 12 7 12 3M21 15C21 16.3333 21 17.6667 21 19C21 20.1046 20.1046 21 19 21C14.3333 21 9.6667 21 5 21C3.8954 21 3 20.1046 3 19C3 17.6667 3 16.3333 3 15M7 10C8.6667 11.6667 10.3333 13.3333 12 15C13.6667 13.3333 15.3333 11.6667 17 10"
  },
  "Headphones": {
    "raw": [
      [
        "path",
        {
          "d": "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"
        }
      ]
    ],
    "d": "M3 14C4 14 5 14 6 14C7.1046 14 8 14.8954 8 16C8 17 8 18 8 19C8 20.1046 7.1046 21 6 21C5.6667 21 5.3333 21 5 21C3.8954 21 3 20.1046 3 19C3 16.6667 3 14.3333 3 12C3 7.0294 7.0294 3 12 3C16.9706 3 21 7.0294 21 12C21 14.3333 21 16.6667 21 19C21 20.1046 20.1046 21 19 21C18.6667 21 18.3333 21 18 21C16.8954 21 16 20.1046 16 19C16 18 16 17 16 16C16 14.8954 16.8954 14 18 14C19 14 20 14 21 14"
  },
  "Sparkles": {
    "raw": [
      [
        "path",
        {
          "d": "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
        }
      ],
      [
        "path",
        {
          "d": "M20 2v4"
        }
      ],
      [
        "path",
        {
          "d": "M22 4h-4"
        }
      ],
      [
        "circle",
        {
          "cx": "4",
          "cy": "20",
          "r": "2"
        }
      ]
    ],
    "d": "M11.017 2.814C11.1054 2.3407 11.5185 1.9976 12 1.9976C12.4815 1.9976 12.8946 2.3407 12.983 2.814C13.3333 4.6667 13.6837 6.5193 14.034 8.372C14.1868 9.1807 14.8193 9.8132 15.628 9.966C17.4807 10.3163 19.3333 10.6667 21.186 11.017C21.6593 11.1054 22.0024 11.5185 22.0024 12C22.0024 12.4815 21.6593 12.8946 21.186 12.983C19.3333 13.3333 17.4807 13.6837 15.628 14.034C14.8193 14.1868 14.1868 14.8193 14.034 15.628C13.6837 17.4807 13.3333 19.3333 12.983 21.186C12.8946 21.6593 12.4815 22.0024 12 22.0024C11.5185 22.0024 11.1054 21.6593 11.017 21.186C10.6667 19.3333 10.3163 17.4807 9.966 15.628C9.8132 14.8193 9.1807 14.1868 8.372 14.034C6.5193 13.6837 4.6667 13.3333 2.814 12.983C2.3407 12.8946 1.9976 12.4815 1.9976 12C1.9976 11.5185 2.3407 11.1054 2.814 11.017C4.6667 10.6667 6.5193 10.3163 8.372 9.966C9.1807 9.8132 9.8132 9.1807 9.966 8.372C10.3163 6.5193 10.6667 4.6667 11.017 2.814ZM20 2C20 3.3333 20 4.6667 20 6M22 4C20.6667 4 19.3333 4 18 4M6 20C6 21.1046 5.1046 22 4 22C2.8954 22 2 21.1046 2 20C2 18.8954 2.8954 18 4 18C5.1046 18 6 18.8954 6 20Z"
  },
  "Sliders": {
    "raw": [
      [
        "path",
        {
          "d": "M10 8h4"
        }
      ],
      [
        "path",
        {
          "d": "M12 21v-9"
        }
      ],
      [
        "path",
        {
          "d": "M12 8V3"
        }
      ],
      [
        "path",
        {
          "d": "M17 16h4"
        }
      ],
      [
        "path",
        {
          "d": "M19 12V3"
        }
      ],
      [
        "path",
        {
          "d": "M19 21v-5"
        }
      ],
      [
        "path",
        {
          "d": "M3 14h4"
        }
      ],
      [
        "path",
        {
          "d": "M5 10V3"
        }
      ],
      [
        "path",
        {
          "d": "M5 21v-7"
        }
      ]
    ],
    "d": "M10 8C11.3333 8 12.6667 8 14 8M12 21C12 18 12 15 12 12M12 8C12 6.3333 12 4.6667 12 3M17 16C18.3333 16 19.6667 16 21 16M19 12C19 9 19 6 19 3M19 21C19 19.3333 19 17.6667 19 16M3 14C4.3333 14 5.6667 14 7 14M5 10C5 7.6667 5 5.3333 5 3M5 21C5 18.6667 5 16.3333 5 14"
  },
  "Search": {
    "raw": [
      [
        "path",
        {
          "d": "m21 21-4.34-4.34"
        }
      ],
      [
        "circle",
        {
          "cx": "11",
          "cy": "11",
          "r": "8"
        }
      ]
    ],
    "d": "M21 21C19.5533 19.5533 18.1067 18.1067 16.66 16.66M19 11C19 15.4183 15.4183 19 11 19C6.5817 19 3 15.4183 3 11C3 6.5817 6.5817 3 11 3C15.4183 3 19 6.5817 19 11Z"
  },
  "Menu": {
    "raw": [
      [
        "path",
        {
          "d": "M4 5h16"
        }
      ],
      [
        "path",
        {
          "d": "M4 12h16"
        }
      ],
      [
        "path",
        {
          "d": "M4 19h16"
        }
      ]
    ],
    "d": "M4 5C9.3333 5 14.6667 5 20 5M4 12C9.3333 12 14.6667 12 20 12M4 19C9.3333 19 14.6667 19 20 19"
  },
  "Send": {
    "raw": [
      [
        "path",
        {
          "d": "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"
        }
      ],
      [
        "path",
        {
          "d": "m21.854 2.147-10.94 10.939"
        }
      ]
    ],
    "d": "M14.536 21.686C14.6138 21.8799 14.804 22.005 15.0128 21.9996C15.2217 21.9943 15.4052 21.8596 15.473 21.662C17.6397 15.3287 19.8063 8.9953 21.973 2.662C22.0383 2.4811 21.9932 2.2788 21.8572 2.1428C21.7212 2.0068 21.5189 1.9617 21.338 2.027C15.0047 4.1937 8.6713 6.3603 2.338 8.527C2.1404 8.5948 2.0057 8.7783 2.0004 8.9872C1.995 9.196 2.1201 9.3862 2.314 9.464C4.9573 10.524 7.6007 11.584 10.244 12.644C10.7506 12.8468 11.1523 13.2478 11.356 13.754C12.416 16.398 13.476 19.042 14.536 21.686ZM21.854 2.147C18.2073 5.7933 14.5607 9.4397 10.914 13.086"
  },
  "Paperclip": {
    "raw": [
      [
        "path",
        {
          "d": "m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"
        }
      ]
    ],
    "d": "M16 6C13.1953 8.862 10.3907 11.724 7.586 14.586C6.8048 15.3672 6.8048 16.6338 7.586 17.415C8.3672 18.1962 9.6338 18.1962 10.415 17.415C13.2197 14.553 16.0243 11.691 18.829 8.829C20.3911 7.2669 20.3911 4.7341 18.829 3.172C17.2669 1.6099 14.7341 1.6099 13.172 3.172C10.379 6.0223 7.586 8.8727 4.793 11.723C3.2567 13.2345 2.649 15.4539 3.2012 17.5372C3.7534 19.6205 5.3805 21.2476 7.4638 21.7998C9.5471 22.352 11.7665 21.7443 13.278 20.208C16.071 17.3577 18.864 14.5073 21.657 11.657"
  },
  "CheckCheck": {
    "raw": [
      [
        "path",
        {
          "d": "M18 6 7 17l-5-5"
        }
      ],
      [
        "path",
        {
          "d": "m22 10-7.5 7.5L13 16"
        }
      ]
    ],
    "d": "M18 6C14.3333 9.6667 10.6667 13.3333 7 17C5.3333 15.3333 3.6667 13.6667 2 12M22 10C19.5 12.5 17 15 14.5 17.5C14 17 13.5 16.5 13 16"
  },
  "AlertCircle": {
    "raw": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "line",
        {
          "x1": "12",
          "x2": "12",
          "y1": "8",
          "y2": "12"
        }
      ],
      [
        "line",
        {
          "x1": "12",
          "x2": "12.01",
          "y1": "16",
          "y2": "16"
        }
      ]
    ],
    "d": "M22 12C22 17.5228 17.5228 22 12 22C6.4772 22 2 17.5228 2 12C2 6.4772 6.4772 2 12 2C17.5228 2 22 6.4772 22 12ZM12 8C12 9.3333 12 10.6667 12 12M12 16C12.0033 16 12.0067 16 12.01 16"
  },
  "Info": {
    "raw": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "path",
        {
          "d": "M12 16v-4"
        }
      ],
      [
        "path",
        {
          "d": "M12 8h.01"
        }
      ]
    ],
    "d": "M22 12C22 17.5228 17.5228 22 12 22C6.4772 22 2 17.5228 2 12C2 6.4772 6.4772 2 12 2C17.5228 2 22 6.4772 22 12ZM12 16C12 14.6667 12 13.3333 12 12M12 8C12.0033 8 12.0067 8 12.01 8"
  },
  "ExternalLink": {
    "raw": [
      [
        "path",
        {
          "d": "M15 3h6v6"
        }
      ],
      [
        "path",
        {
          "d": "M10 14 21 3"
        }
      ],
      [
        "path",
        {
          "d": "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
        }
      ]
    ],
    "d": "M15 3C17 3 19 3 21 3C21 5 21 7 21 9M10 14C13.6667 10.3333 17.3333 6.6667 21 3M18 13C18 15 18 17 18 19C18 20.1046 17.1046 21 16 21C12.3333 21 8.6667 21 5 21C3.8954 21 3 20.1046 3 19C3 15.3333 3 11.6667 3 8C3 6.8954 3.8954 6 5 6C7 6 9 6 11 6"
  },
  "FileText": {
    "raw": [
      [
        "path",
        {
          "d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
        }
      ],
      [
        "path",
        {
          "d": "M14 2v5a1 1 0 0 0 1 1h5"
        }
      ],
      [
        "path",
        {
          "d": "M10 9H8"
        }
      ],
      [
        "path",
        {
          "d": "M16 13H8"
        }
      ],
      [
        "path",
        {
          "d": "M16 17H8"
        }
      ]
    ],
    "d": "M6 22C4.8954 22 4 21.1046 4 20C4 14.6667 4 9.3333 4 4C4 2.8954 4.8954 2 6 2C8.6667 2 11.3333 2 14 2C14.6394 1.999 15.2527 2.2531 15.704 2.706C16.9 3.902 18.096 5.098 19.292 6.294C19.7461 6.7454 20.001 7.3597 20 8C20 12 20 16 20 20C20 21.1046 19.1046 22 18 22C14 22 10 22 6 22ZM14 2C14 3.6667 14 5.3333 14 7C14 7.5523 14.4477 8 15 8C16.6667 8 18.3333 8 20 8M10 9C9.3333 9 8.6667 9 8 9M16 13C13.3333 13 10.6667 13 8 13M16 17C13.3333 17 10.6667 17 8 17"
  },
  "Image": {
    "raw": [
      [
        "rect",
        {
          "width": "18",
          "height": "18",
          "x": "3",
          "y": "3",
          "rx": "2",
          "ry": "2"
        }
      ],
      [
        "circle",
        {
          "cx": "9",
          "cy": "9",
          "r": "2"
        }
      ],
      [
        "path",
        {
          "d": "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
        }
      ]
    ],
    "d": "M5 3C9.6667 3 14.3333 3 19 3C20.1046 3 21 3.8954 21 5C21 9.6667 21 14.3333 21 19C21 20.1046 20.1046 21 19 21C14.3333 21 9.6667 21 5 21C3.8954 21 3 20.1046 3 19C3 14.3333 3 9.6667 3 5C3 3.8954 3.8954 3 5 3ZM11 9C11 10.1046 10.1046 11 9 11C7.8954 11 7 10.1046 7 9C7 7.8954 7.8954 7 9 7C10.1046 7 11 7.8954 11 9ZM21 15C19.9713 13.9713 18.9427 12.9427 17.914 11.914C17.133 11.1332 15.867 11.1332 15.086 11.914C12.0573 14.9427 9.0287 17.9713 6 21"
  },
  "ChevronDown": {
    "raw": [
      [
        "path",
        {
          "d": "m6 9 6 6 6-6"
        }
      ]
    ],
    "d": "M6 9C8 11 10 13 12 15C14 13 16 11 18 9"
  },
  "ChevronUp": {
    "raw": [
      [
        "path",
        {
          "d": "m18 15-6-6-6 6"
        }
      ]
    ],
    "d": "M18 15C16 13 14 11 12 9C10 11 8 13 6 15"
  },
  "Settings": {
    "raw": [
      [
        "path",
        {
          "d": "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "3"
        }
      ]
    ],
    "d": "M9.671 4.136C9.7852 2.9348 10.7939 2.0174 12.0005 2.0174C13.2071 2.0174 14.2158 2.9348 14.33 4.136C14.3972 4.8959 14.8307 5.5754 15.4915 5.9567C16.1523 6.3379 16.9574 6.3731 17.649 6.051C18.7452 5.5533 20.0402 5.9686 20.6425 7.0111C21.2448 8.0536 20.9577 9.3829 19.979 10.084C19.3547 10.522 18.983 11.2369 18.983 11.9995C18.983 12.7621 19.3547 13.477 19.979 13.915C20.9577 14.6161 21.2448 15.9454 20.6425 16.9879C20.0402 18.0304 18.7452 18.4457 17.649 17.948C16.9574 17.6259 16.1523 17.6611 15.4915 18.0423C14.8307 18.4236 14.3972 19.1031 14.33 19.863C14.2158 21.0642 13.2071 21.9816 12.0005 21.9816C10.7939 21.9816 9.7852 21.0642 9.671 19.863C9.6039 19.1028 9.1703 18.423 8.5092 18.0417C7.8481 17.6604 7.0427 17.6254 6.351 17.948C5.2548 18.4457 3.9598 18.0304 3.3575 16.9879C2.7552 15.9454 3.0423 14.6161 4.021 13.915C4.6453 13.477 5.017 12.7621 5.017 11.9995C5.017 11.2369 4.6453 10.522 4.021 10.084C3.0437 9.3826 2.7574 8.0544 3.359 7.0127C3.9606 5.971 5.254 5.5551 6.35 6.051C7.0416 6.3731 7.8467 6.3379 8.5075 5.9567C9.1683 5.5754 9.6018 4.8959 9.669 4.136M15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C13.6569 9 15 10.3431 15 12Z"
  },
  "Moon": {
    "raw": [
      [
        "path",
        {
          "d": "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
        }
      ]
    ],
    "d": "M20.985 12.486C20.7239 17.3235 16.6804 21.0863 11.8366 20.9994C6.9929 20.9125 3.087 17.007 2.9996 12.1633C2.9121 7.3195 6.6745 3.2757 11.512 3.014C11.917 2.992 12.129 3.474 11.914 3.817C10.4332 6.1863 10.7837 9.2641 12.7593 11.2397C14.7349 13.2153 17.8127 13.5658 20.182 12.085C20.526 11.87 21.007 12.081 20.985 12.486"
  },
  "Sun": {
    "raw": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "4"
        }
      ],
      [
        "path",
        {
          "d": "M12 2v2"
        }
      ],
      [
        "path",
        {
          "d": "M12 20v2"
        }
      ],
      [
        "path",
        {
          "d": "m4.93 4.93 1.41 1.41"
        }
      ],
      [
        "path",
        {
          "d": "m17.66 17.66 1.41 1.41"
        }
      ],
      [
        "path",
        {
          "d": "M2 12h2"
        }
      ],
      [
        "path",
        {
          "d": "M20 12h2"
        }
      ],
      [
        "path",
        {
          "d": "m6.34 17.66-1.41 1.41"
        }
      ],
      [
        "path",
        {
          "d": "m19.07 4.93-1.41 1.41"
        }
      ]
    ],
    "d": "M16 12C16 14.2091 14.2091 16 12 16C9.7909 16 8 14.2091 8 12C8 9.7909 9.7909 8 12 8C14.2091 8 16 9.7909 16 12ZM12 2C12 2.6667 12 3.3333 12 4M12 20C12 20.6667 12 21.3333 12 22M4.93 4.93C5.4 5.4 5.87 5.87 6.34 6.34M17.66 17.66C18.13 18.13 18.6 18.6 19.07 19.07M2 12C2.6667 12 3.3333 12 4 12M20 12C20.6667 12 21.3333 12 22 12M6.34 17.66C5.87 18.13 5.4 18.6 4.93 19.07M19.07 4.93C18.6 5.4 18.13 5.87 17.66 6.34"
  }
};

    function resolveIcon(name) {
        if (!name) return null;
        if (typeof name !== 'string') return name;
        const normalized = name.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
        const pascal = normalized.charAt(0).toUpperCase() + normalized.slice(1);
        if (ICONS[pascal]) return ICONS[pascal].raw;
        if (ICONS[name]) return ICONS[name].raw;
        return null;
    }

    function resolveD(name) {
        if (!name) return '';
        if (typeof name !== 'string') {
            try { return canonicalD(name); } catch(e) { return ''; }
        }
        const normalized = name.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
        const pascal = normalized.charAt(0).toUpperCase() + normalized.slice(1);
        if (ICONS[pascal]) return ICONS[pascal].d;
        if (ICONS[name]) return ICONS[name].d;
        return '';
    }

    
//#region src/core/interpolate.ts
/** Preallocated output buffers for a plan (zero allocation per frame). */
function allocOutputs(plan) {
	return plan.items.map(() => new Float64Array(2 * plan.n));
}
function interpPolar(plan, t, out) {
	for (let k = 0; k < plan.items.length; k++) {
		const it = plan.items[k];
		const o = out[k];
		const n = plan.n;
		const s = Math.exp(it.lnSigma * t);
		const ang = it.theta * t;
		const cos = Math.cos(ang) * s;
		const sin = Math.sin(ang) * s;
		let cx;
		let cy;
		if (it.block) {
			const [ox, oy] = it.block.off;
			const [dx, dy] = it.block.drift;
			cx = it.ca[0] + dx * t + (ox * cos - oy * sin - ox);
			cy = it.ca[1] + dy * t + (ox * sin + oy * cos - oy);
		} else {
			cx = it.ca[0] + (it.cb[0] - it.ca[0]) * t;
			cy = it.ca[1] + (it.cb[1] - it.ca[1]) * t;
		}
		for (let i = 0; i < n; i++) {
			const px = it.aC[2 * i] + (it.bT[2 * i] - it.aC[2 * i]) * t;
			const py = it.aC[2 * i + 1] + (it.bT[2 * i + 1] - it.aC[2 * i + 1]) * t;
			o[2 * i] = cx + px * cos - py * sin;
			o[2 * i + 1] = cy + px * sin + py * cos;
		}
	}
}
/** Raw coordinate lerp (same correspondence, no decomposition). */
function interpLinear(plan, t, out) {
	for (let k = 0; k < plan.items.length; k++) {
		const it = plan.items[k];
		const o = out[k];
		const n = plan.n;
		for (let i = 0; i < n; i++) {
			o[2 * i] = it.a[2 * i] + (it.bO[2 * i] - it.a[2 * i]) * t;
			o[2 * i + 1] = it.a[2 * i + 1] + (it.bO[2 * i + 1] - it.a[2 * i + 1]) * t;
		}
	}
}
//#endregion
//#region src/core/plan.ts
/** Weight of |ΔL| in the subpath pairing cost. */
const LEN_WEIGHT = .35;
/** λ of the minimal-rotation tie-break: score = res + λ·|θ|/π.
*  It exists because shapes symmetric under inversion (lines) tie in
*  residual for both traversal orientations yet produce different rotations. */
const LAMBDA = .05;
/** Global residual below which the whole icon counts as congruent and the
*  plan shares (θ, σ) across all items (hybrid variant of Procrustes). */
const GLOBAL_EPS = .005;
/** Bounds for exhaustive matching; above them it falls back to greedy with
*  repair. 8! = 40 320 permutations / 1e5 assignments — both sub-ms. */
const PERM_MAX = 8;
const SURJ_MAX = 1e5;
function centroid(p) {
	const n = p.length / 2;
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < n; i++) {
		cx += p[2 * i];
		cy += p[2 * i + 1];
	}
	return [cx / n, cy / n];
}
function polyLen(p) {
	const n = p.length / 2;
	let L = 0;
	for (let i = 1; i < n; i++) L += Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
	return L;
}
function reversePts(p) {
	const n = p.length / 2;
	const out = new Float64Array(2 * n);
	for (let i = 0; i < n; i++) {
		out[2 * i] = p[2 * (n - 1 - i)];
		out[2 * i + 1] = p[2 * (n - 1 - i) + 1];
	}
	return out;
}
/** Circular re-indexing of a loop: out[i] = p[(i+off) mod n]. Same point
*  set, different cut point — the circular degree of freedom of closed paths. */
function rotatePts(p, off) {
	const n = p.length / 2;
	const out = new Float64Array(2 * n);
	for (let i = 0; i < n; i++) {
		const j = (i + off) % n;
		out[2 * i] = p[2 * j];
		out[2 * i + 1] = p[2 * j + 1];
	}
	return out;
}
/** Optimal similarity (θ, σ) minimizing Σ|σ·R(θ)·(a−c_A) − (b−c_B)|².
*  θ* = atan2(S_xy − S_yx, S_xx + S_yy); σ* by zero derivative.
*  res = RMS residual normalized by b's energy (0 → same shape). */
function procrustes(a, b, ca, cb) {
	const n = a.length / 2;
	let sxx = 0;
	let sxy = 0;
	let syx = 0;
	let syy = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < n; i++) {
		const ax = a[2 * i] - ca[0];
		const ay = a[2 * i + 1] - ca[1];
		const bx = b[2 * i] - cb[0];
		const by = b[2 * i + 1] - cb[1];
		sxx += ax * bx;
		syy += ay * by;
		sxy += ax * by;
		syx += ay * bx;
		na += ax * ax + ay * ay;
		nb += bx * bx + by * by;
	}
	const theta = Math.atan2(sxy - syx, sxx + syy);
	const num = Math.cos(theta) * (sxx + syy) + Math.sin(theta) * (sxy - syx);
	let sigma = na > 1e-12 ? num / na : 1;
	if (!(sigma > 1e-6)) sigma = 1e-6;
	const res2 = Math.max(0, sigma * sigma * na - 2 * sigma * num + nb);
	const res = nb > 1e-12 ? Math.sqrt(res2 / nb) : 0;
	return {
		theta,
		sigma,
		res
	};
}
/** Best index-to-index correspondence between a and b: tries both traversal
*  directions and, if there is a closed loop, its N circular offsets,
*  scoring with score = res + λ·|θ|/π. The freedom is applied to ONE cloud
*  — the closed one (b if both are); varying both at once would be
*  redundant. */
function alignPair(aPts, bPts, aClosed = false, bClosed = false) {
	const ca = centroid(aPts);
	const cb = centroid(bPts);
	const varyA = aClosed && !bClosed;
	const base = varyA ? aPts : bPts;
	const offs = aClosed || bClosed ? base.length / 2 : 1;
	let bestScore = Number.POSITIVE_INFINITY;
	let best = base;
	let sim = {
		theta: 0,
		sigma: 1,
		res: 0
	};
	for (let dir = 0; dir < 2; dir++) {
		const walk = dir ? reversePts(base) : base;
		for (let off = 0; off < offs; off++) {
			const cand = off ? rotatePts(walk, off) : walk;
			const s = varyA ? procrustes(cand, bPts, ca, cb) : procrustes(aPts, cand, ca, cb);
			const score = s.res + LAMBDA * Math.abs(s.theta) / Math.PI;
			if (score < bestScore) {
				bestScore = score;
				best = cand;
				sim = s;
			}
		}
	}
	return varyA ? {
		ca,
		cb,
		a: best,
		b: bPts,
		...sim
	} : {
		ca,
		cb,
		a: aPts,
		b: best,
		...sim
	};
}
function costMatrix(A, B) {
	const cbs = B.map(centroid);
	const lbs = B.map(polyLen);
	return A.map((a) => {
		const ca = centroid(a);
		const la = polyLen(a);
		return cbs.map((cb, j) => Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) + LEN_WEIGHT * Math.abs(la - lbs[j]));
	});
}
function bestPermutation(C) {
	const n = C.length;
	if (n > PERM_MAX) {
		const pairs = [];
		for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pairs.push([
			C[i][j],
			i,
			j
		]);
		pairs.sort((x, y) => x[0] - y[0]);
		const out = new Array(n).fill(-1);
		const used = new Array(n).fill(false);
		for (const [, i, j] of pairs) if (out[i] < 0 && !used[j]) {
			out[i] = j;
			used[j] = true;
		}
		return out;
	}
	const idx = Array.from({ length: n }, (_, i) => i);
	let best = idx.slice();
	let bc = Number.POSITIVE_INFINITY;
	const perm = (arr, k, acc) => {
		if (acc >= bc) return;
		if (k === n) {
			bc = acc;
			best = arr.slice();
			return;
		}
		for (let i = k; i < n; i++) {
			[arr[k], arr[i]] = [arr[i], arr[k]];
			perm(arr, k + 1, acc + C[k][arr[k]]);
			[arr[k], arr[i]] = [arr[i], arr[k]];
		}
	};
	perm(idx, 0, 0);
	return best;
}
function bestSurjection(C) {
	const B = C.length;
	const S = C[0].length;
	if (S ** B > SURJ_MAX) {
		const f = C.map((row) => {
			let m = 0;
			for (let j = 1; j < row.length; j++) if (row[j] < row[m]) m = j;
			return m;
		});
		const mult = new Array(S).fill(0);
		for (const s of f) mult[s]++;
		for (let s = 0; s < S; s++) {
			if (mult[s] > 0) continue;
			let bi = -1;
			let bc = Number.POSITIVE_INFINITY;
			for (let i = 0; i < B; i++) {
				if (mult[f[i]] < 2) continue;
				const extra = C[i][s] - C[i][f[i]];
				if (extra < bc) {
					bc = extra;
					bi = i;
				}
			}
			mult[f[bi]]--;
			f[bi] = s;
			mult[s]++;
		}
		return f;
	}
	let best = null;
	let bc = Number.POSITIVE_INFINITY;
	const f = new Array(B);
	const mult = new Array(S).fill(0);
	const rec = (i, acc, covered) => {
		if (acc >= bc || S - covered > B - i) return;
		if (i === B) {
			bc = acc;
			best = f.slice();
			return;
		}
		for (let s = 0; s < S; s++) {
			f[i] = s;
			mult[s]++;
			rec(i + 1, acc + C[i][s], covered + (mult[s] === 1 ? 1 : 0));
			mult[s]--;
		}
	};
	rec(0, 0, 0);
	if (!best) throw new Error("morphicons: no valid surjection (B < S)");
	return best;
}
function applyGlobal(items, n) {
	const T = items.length * n;
	const ga = new Float64Array(2 * T);
	const gb = new Float64Array(2 * T);
	items.forEach((it, k) => {
		ga.set(it.a, 2 * n * k);
		gb.set(it.bO, 2 * n * k);
	});
	const gca = centroid(ga);
	const g = procrustes(ga, gb, gca, centroid(gb));
	if (g.res >= GLOBAL_EPS) return;
	const cos = Math.cos(-g.theta);
	const sin = Math.sin(-g.theta);
	const rc = Math.cos(g.theta);
	const rs = Math.sin(g.theta);
	for (const it of items) {
		let e2 = 0;
		let nb = 0;
		for (let i = 0; i < n; i++) {
			const bx = it.bO[2 * i] - it.cb[0];
			const by = it.bO[2 * i + 1] - it.cb[1];
			it.bT[2 * i] = (bx * cos - by * sin) / g.sigma;
			it.bT[2 * i + 1] = (bx * sin + by * cos) / g.sigma;
			const ex = g.sigma * (rc * it.aC[2 * i] - rs * it.aC[2 * i + 1]) - bx;
			const ey = g.sigma * (rs * it.aC[2 * i] + rc * it.aC[2 * i + 1]) - by;
			e2 += ex * ex + ey * ey;
			nb += bx * bx + by * by;
		}
		it.theta = g.theta;
		it.lnSigma = Math.log(g.sigma);
		it.res = nb > 1e-12 ? Math.sqrt(e2 / nb) : 0;
		const s1 = Math.exp(it.lnSigma);
		const c1 = Math.cos(it.theta) * s1;
		const n1 = Math.sin(it.theta) * s1;
		const ox = it.ca[0] - gca[0];
		const oy = it.ca[1] - gca[1];
		const rx = ox * c1 - oy * n1 - ox;
		const ry = ox * n1 + oy * c1 - oy;
		it.block = {
			off: [ox, oy],
			drift: [it.cb[0] - it.ca[0] - rx, it.cb[1] - it.ca[1] - ry]
		};
	}
}
/** Builds the morph plan between two lists of sampled subpaths. The plan is
*  cacheable and serializable; it accepts any list — including intermediate
*  shapes (interruptions). */
function buildPlan(srcSubs, dstSubs) {
	const p = srcSubs.length;
	const q = dstSubs.length;
	if (p === 0 || q === 0) throw new Error("morphicons: icon has no subpaths");
	const A = srcSubs.map((s) => s.pts);
	const B = dstSubs.map((s) => s.pts);
	const pairs = [];
	if (p === q) {
		const perm = bestPermutation(costMatrix(A, B));
		for (let i = 0; i < p; i++) pairs.push([i, perm[i]]);
	} else if (p < q) {
		const f = bestSurjection(costMatrix(B, A));
		for (let j = 0; j < q; j++) pairs.push([f[j], j]);
	} else {
		const f = bestSurjection(costMatrix(A, B));
		for (let i = 0; i < p; i++) pairs.push([i, f[i]]);
	}
	const n = A[0].length / 2;
	const items = pairs.map(([si, di]) => {
		const al = alignPair(A[si], B[di], srcSubs[si].closed, dstSubs[di].closed);
		const a = al.a;
		const aC = new Float64Array(2 * n);
		const bT = new Float64Array(2 * n);
		const bO = new Float64Array(2 * n);
		const cos = Math.cos(-al.theta);
		const sin = Math.sin(-al.theta);
		for (let i = 0; i < n; i++) {
			aC[2 * i] = a[2 * i] - al.ca[0];
			aC[2 * i + 1] = a[2 * i + 1] - al.ca[1];
			const bx = al.b[2 * i] - al.cb[0];
			const by = al.b[2 * i + 1] - al.cb[1];
			bT[2 * i] = (bx * cos - by * sin) / al.sigma;
			bT[2 * i + 1] = (bx * sin + by * cos) / al.sigma;
			bO[2 * i] = al.b[2 * i];
			bO[2 * i + 1] = al.b[2 * i + 1];
		}
		return {
			a,
			aC,
			bT,
			bO,
			ca: al.ca,
			cb: al.cb,
			theta: al.theta,
			lnSigma: Math.log(al.sigma),
			res: al.res,
			closed: srcSubs[si].closed && dstSubs[di].closed,
			block: null
		};
	});
	if (items.length > 1) applyGlobal(items, n);
	return {
		items,
		n
	};
}
//#endregion
//#region src/core/resample.ts
/** Default angular threshold for a segment joint to count as a corner. */
const CORNER_THRESHOLD = Math.PI / 8;
const GX = [
	.18343464249564978,
	.525532409916329,
	.7966664774136267,
	.9602898564975363
];
const GW = [
	.362683783378362,
	.31370664587788727,
	.22238103445337448,
	.10122853629037626
];
function speed(p, k, t) {
	const i = 6 * k;
	const u = 1 - t;
	const c0 = 3 * u * u;
	const c1 = 6 * u * t;
	const c2 = 3 * t * t;
	const dx = c0 * (p[i + 2] - p[i]) + c1 * (p[i + 4] - p[i + 2]) + c2 * (p[i + 6] - p[i + 4]);
	const dy = c0 * (p[i + 3] - p[i + 1]) + c1 * (p[i + 5] - p[i + 3]) + c2 * (p[i + 7] - p[i + 5]);
	return Math.hypot(dx, dy);
}
function segLen(p, k, t1 = 1) {
	const half = t1 / 2;
	let s = 0;
	for (let j = 0; j < 4; j++) s += GW[j] * (speed(p, k, half + half * GX[j]) + speed(p, k, half - half * GX[j]));
	return s * half;
}
function point(p, k, t, out, o) {
	const i = 6 * k;
	const u = 1 - t;
	const b0 = u * u * u;
	const b1 = 3 * u * u * t;
	const b2 = 3 * u * t * t;
	const b3 = t * t * t;
	out[o] = b0 * p[i] + b1 * p[i + 2] + b2 * p[i + 4] + b3 * p[i + 6];
	out[o + 1] = b0 * p[i + 1] + b1 * p[i + 3] + b2 * p[i + 5] + b3 * p[i + 7];
}
function tangent(p, k, atEnd) {
	const i = 6 * k;
	const b = atEnd ? i + 6 : i;
	const s = atEnd ? -1 : 1;
	for (const j of atEnd ? [
		4,
		2,
		0
	] : [
		2,
		4,
		6
	]) {
		const dx = s * (p[i + j] - p[b]);
		const dy = s * (p[i + j + 1] - p[b + 1]);
		if (dx * dx + dy * dy > 1e-18) return [dx, dy];
	}
	return null;
}
/** Segment boundaries (index of the segment starting at the corner) whose
*  tangent discontinuity exceeds the threshold. For closed paths this
*  includes the closing joint (boundary = first active segment). */
function detectCorners(path, threshold = CORNER_THRESHOLD) {
	const p = path.pts;
	const m = (p.length / 2 - 1) / 3;
	const active = [];
	for (let k = 0; k < m; k++) if (segLen(p, k) > 1e-9) active.push(k);
	if (active.length === 0) return [];
	const corners = /* @__PURE__ */ new Set();
	const test = (a, b) => {
		const u = tangent(p, a, true);
		const v = tangent(p, b, false);
		if (!u || !v) return;
		if (Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) > threshold) corners.add(b);
	};
	for (let j = 0; j + 1 < active.length; j++) test(active[j], active[j + 1]);
	if (path.closed && active.length > 1) test(active[active.length - 1], active[0]);
	return [...corners].sort((a, b) => a - b);
}
function invert(p, k, s, ls) {
	if (s <= 0) return 0;
	if (s >= ls) return 1;
	let lo = 0;
	let hi = 1;
	let t = s / ls;
	for (let it = 0; it < 12; it++) {
		const f = segLen(p, k, t) - s;
		if (Math.abs(f) < 1e-10 * ls + 1e-14) break;
		if (f > 0) hi = t;
		else lo = t;
		const sp = speed(p, k, t);
		let nt = sp > 1e-12 ? t - f / sp : (lo + hi) / 2;
		if (!(nt > lo && nt < hi)) nt = (lo + hi) / 2;
		t = nt;
	}
	return t;
}
/** Samples a cubic subpath at N points equidistant by arc length, anchoring
*  corners and endpoints as exact samples. Returns Float64Array(2N). Closed
*  paths distribute N intervals around the loop (without duplicating the
*  first point); the circular start-point freedom is resolved by the plan's
*  circular correspondence. */
function resamplePath(path, N = 64, cornerThreshold = CORNER_THRESHOLD) {
	const p = path.pts;
	const m = (p.length / 2 - 1) / 3;
	const out = new Float64Array(2 * N);
	const fill = () => {
		for (let i = 0; i < N; i++) {
			out[2 * i] = p[0];
			out[2 * i + 1] = p[1];
		}
		return out;
	};
	if (m < 1) return fill();
	const lens = new Array(m);
	let L = 0;
	for (let k = 0; k < m; k++) {
		lens[k] = segLen(p, k);
		L += lens[k];
	}
	if (L < 1e-12) return fill();
	const cs = detectCorners(path, cornerThreshold);
	const anchors = path.closed ? cs.length > 0 ? cs : [0] : [.../* @__PURE__ */ new Set([
		0,
		...cs,
		m
	])].sort((a, b) => a - b);
	const runs = [];
	if (path.closed) for (let j = 0; j < anchors.length; j++) {
		const a = anchors[j];
		const b = j + 1 < anchors.length ? anchors[j + 1] : anchors[0] + m;
		runs.push([a, b]);
	}
	else for (let j = 0; j + 1 < anchors.length; j++) runs.push([anchors[j], anchors[j + 1]]);
	const rl = runs.map(([a, b]) => {
		let s = 0;
		for (let k = a; k < b; k++) s += lens[k % m];
		return s;
	});
	const intervals = path.closed ? N : N - 1;
	if (runs.length > intervals) throw new Error(`morphicons: N=${N} too small (${runs.length} runs)`);
	const total = rl.reduce((a, b) => a + b, 0) || 1;
	const ideal = rl.map((l) => intervals * l / total);
	const counts = ideal.map((q) => Math.max(1, Math.floor(q)));
	let R = intervals - counts.reduce((a, b) => a + b, 0);
	if (R > 0) {
		const order = ideal.map((q, idx) => [Math.round((q - Math.floor(q)) * 1e9), idx]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
		for (let j = 0; j < R; j++) counts[order[j % counts.length][1]]++;
	}
	while (R < 0) {
		let bi = 0;
		for (let idx = 1; idx < counts.length; idx++) if (counts[idx] > counts[bi]) bi = idx;
		if (counts[bi] <= 1) break;
		counts[bi]--;
		R++;
	}
	let w = 0;
	for (let r = 0; r < runs.length; r++) {
		const [k0, k1] = runs[r];
		const cnt = counts[r];
		const Lr = rl[r];
		const vi = 6 * (k0 % m);
		out[2 * w] = p[vi];
		out[2 * w + 1] = p[vi + 1];
		w++;
		let seg = k0;
		let acc = 0;
		for (let j = 1; j < cnt; j++) {
			const target = Lr * j / cnt;
			while (seg < k1 - 1 && acc + lens[seg % m] < target) {
				acc += lens[seg % m];
				seg++;
			}
			const k = seg % m;
			const ls = lens[k];
			point(p, k, ls > 1e-12 ? invert(p, k, target - acc, ls) : 0, out, 2 * w);
			w++;
		}
	}
	if (!path.closed) {
		const vi = 6 * m;
		out[2 * w] = p[vi];
		out[2 * w + 1] = p[vi + 1];
	}
	return out;
}
/** Full input pipeline: icon → cubics → sampled subpaths with their
*  topology (the plan needs to know which subpaths are closed loops). */
function resampleIcon(input, N = 64) {
	return iconToCubics(input).map((path) => ({
		pts: resamplePath(path, N),
		closed: path.closed
	}));
}
//#endregion
//#region src/core/spring.ts
var Spring = class {
	x = 1;
	v = 0;
	k = 250;
	c = 24;
	config(k, c) {
		this.k = k;
		this.c = c;
	}
	/** Starts (or restarts mid-flight) preserving velocity. */
	start() {
		this.x = 0;
		if (this.v > 14) this.v = 14;
		if (this.v < -14) this.v = -14;
	}
	/** Advances dt seconds. Returns true on settle (|1−x| < 0.001 ∧ |v| < 0.02). */
	step(dt) {
		const steps = Math.max(1, Math.min(16, Math.ceil(dt / (1 / 240))));
		const s = dt / steps;
		for (let i = 0; i < steps; i++) {
			const a = this.k * (1 - this.x) - this.c * this.v;
			this.v += a * s;
			this.x += this.v * s;
		}
		return Math.abs(1 - this.x) < .001 && Math.abs(this.v) < .02;
	}
};
/** Spring presets (ζ = c/(2√k)) with the API's public names. */
const SPRING_PRESETS = {
	/** ζ = 1.00 — critically damped, no overshoot. */
	smooth: {
		k: 170,
		c: 26
	},
	/** ζ = 0.73 — fast, subtle overshoot. */
	snappy: {
		k: 420,
		c: 30
	},
	/** ζ = 0.40 — playful. */
	bouncy: {
		k: 300,
		c: 14
	}
};
//#endregion


    //#region src/core/parse.ts
const COMMANDS = "MmLlHhVvCcSsQqTtAaZz";
function parsePath(d) {
	const subs = [];
	const n = d.length;
	let i = 0;
	let cx = 0;
	let cy = 0;
	let sx = 0;
	let sy = 0;
	let cur = null;
	let cmd = "";
	let px = 0;
	let py = 0;
	let prev = "";
	let started = false;
	const err = (msg) => {
		throw new Error(`morphicons: ${msg} at d[${i}]`);
	};
	const isDigit = (c) => c >= 48 && c <= 57;
	const skip = () => {
		while (i < n) {
			const c = d.charCodeAt(i);
			if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 44) i++;
			else break;
		}
	};
	const num = () => {
		skip();
		const start = i;
		if (i < n && (d[i] === "+" || d[i] === "-")) i++;
		let dig = false;
		while (i < n && isDigit(d.charCodeAt(i))) {
			i++;
			dig = true;
		}
		if (i < n && d[i] === ".") {
			i++;
			while (i < n && isDigit(d.charCodeAt(i))) {
				i++;
				dig = true;
			}
		}
		if (!dig) err("expected number");
		if (i < n && (d[i] === "e" || d[i] === "E")) {
			const save = i;
			i++;
			if (i < n && (d[i] === "+" || d[i] === "-")) i++;
			let ed = false;
			while (i < n && isDigit(d.charCodeAt(i))) {
				i++;
				ed = true;
			}
			if (!ed) i = save;
		}
		return Number(d.slice(start, i));
	};
	const flag = () => {
		skip();
		const c = d[i];
		if (c === "0" || c === "1") {
			i++;
			return c === "1" ? 1 : 0;
		}
		return err("expected arc flag (0|1)");
	};
	const open = () => {
		if (!started) err("path must start with M/m");
		if (!cur) {
			cur = {
				x0: cx,
				y0: cy,
				segs: [],
				closed: false
			};
			subs.push(cur);
		}
		return cur;
	};
	let rel = false;
	const nx = () => num() + (rel ? cx : 0);
	const ny = () => num() + (rel ? cy : 0);
	while (true) {
		skip();
		if (i >= n) break;
		const ch = d[i];
		if (COMMANDS.includes(ch)) {
			cmd = ch;
			i++;
		} else if (cmd === "") err("path must start with M/m");
		else if (cmd === "M") cmd = "L";
		else if (cmd === "m") cmd = "l";
		else if (cmd === "Z" || cmd === "z") err("stray data after Z");
		rel = cmd >= "a";
		switch (rel ? cmd.toUpperCase() : cmd) {
			case "M": {
				started = true;
				const x = nx();
				const y = ny();
				cx = x;
				cy = y;
				sx = x;
				sy = y;
				cur = {
					x0: x,
					y0: y,
					segs: [],
					closed: false
				};
				subs.push(cur);
				prev = "";
				break;
			}
			case "L": {
				const x = nx();
				const y = ny();
				open().segs.push([
					"L",
					x,
					y
				]);
				cx = x;
				cy = y;
				prev = "";
				break;
			}
			case "H": {
				const x = nx();
				open().segs.push([
					"L",
					x,
					cy
				]);
				cx = x;
				prev = "";
				break;
			}
			case "V": {
				const y = ny();
				open().segs.push([
					"L",
					cx,
					y
				]);
				cy = y;
				prev = "";
				break;
			}
			case "C":
			case "S": {
				let x1;
				let y1;
				if (cmd === "C" || cmd === "c") {
					x1 = nx();
					y1 = ny();
				} else {
					x1 = prev === "C" ? 2 * cx - px : cx;
					y1 = prev === "C" ? 2 * cy - py : cy;
				}
				const x2 = nx();
				const y2 = ny();
				const x = nx();
				const y = ny();
				open().segs.push([
					"C",
					x1,
					y1,
					x2,
					y2,
					x,
					y
				]);
				px = x2;
				py = y2;
				cx = x;
				cy = y;
				prev = "C";
				break;
			}
			case "Q":
			case "T": {
				let x1;
				let y1;
				if (cmd === "Q" || cmd === "q") {
					x1 = nx();
					y1 = ny();
				} else {
					x1 = prev === "Q" ? 2 * cx - px : cx;
					y1 = prev === "Q" ? 2 * cy - py : cy;
				}
				const x = nx();
				const y = ny();
				open().segs.push([
					"Q",
					x1,
					y1,
					x,
					y
				]);
				px = x1;
				py = y1;
				cx = x;
				cy = y;
				prev = "Q";
				break;
			}
			case "A": {
				const rx = num();
				const ry = num();
				const rot = num();
				const large = flag();
				const sweep = flag();
				const x = nx();
				const y = ny();
				open().segs.push([
					"A",
					rx,
					ry,
					rot,
					large,
					sweep,
					x,
					y
				]);
				cx = x;
				cy = y;
				prev = "";
				break;
			}
			case "Z":
				if (cur) {
					cur.closed = true;
					cur = null;
				}
				cx = sx;
				cy = sy;
				prev = "";
				break;
			default: err(`unsupported command "${cmd}"`);
		}
	}
	return subs.filter((s) => s.segs.length > 0);
}
//#endregion
//#region src/core/serialize.ts
function fmt(v) {
	return String(Math.round(v * 100) / 100);
}
/** Sampled subpaths → polyline `d` attribute. `closed[k]` appends Z to
*  subpath k (closed loops in flight); without flags everything is open. */
function serialize(subs, closed) {
	let d = "";
	for (let k = 0; k < subs.length; k++) {
		const o = subs[k];
		const n = o.length / 2;
		d += `M${fmt(o[0])} ${fmt(o[1])}`;
		for (let i = 1; i < n; i++) d += `L${fmt(o[2 * i])} ${fmt(o[2 * i + 1])}`;
		if (closed?.[k]) d += "Z";
	}
	return d;
}
function fmtCanon(v) {
	return String(Math.round(v * 1e4) / 1e4);
}
/** Cubic subpaths → canonical `d`, quantized to 4 decimals (engine-stable
*  bytes; see fmtCanon). */
function cubicsToPathD(paths) {
	let d = "";
	for (const { pts, closed } of paths) {
		d += `M${fmtCanon(pts[0])} ${fmtCanon(pts[1])}`;
		for (let i = 2; i < pts.length; i += 6) d += `C${fmtCanon(pts[i])} ${fmtCanon(pts[i + 1])} ${fmtCanon(pts[i + 2])} ${fmtCanon(pts[i + 3])} ${fmtCanon(pts[i + 4])} ${fmtCanon(pts[i + 5])}`;
		if (closed) d += "Z";
	}
	return d;
}
//#endregion
//#region src/core/normalize.ts
/** Control-point offset for a quarter circle: (4/3)·tan(π/8) ≈ 0.5523. */
const KAPPA = 4 / 3 * Math.tan(Math.PI / 8);
const TAU = 2 * Math.PI;
function builder(x0, y0) {
	const pts = [x0, y0];
	let cx = x0;
	let cy = y0;
	const cubic = (x1, y1, x2, y2, x, y) => {
		pts.push(x1, y1, x2, y2, x, y);
		cx = x;
		cy = y;
	};
	const line = (x, y) => {
		if (Math.abs(x - cx) < 1e-12 && Math.abs(y - cy) < 1e-12) return;
		cubic(cx + (x - cx) / 3, cy + (y - cy) / 3, cx + 2 * (x - cx) / 3, cy + 2 * (y - cy) / 3, x, y);
	};
	const quad = (x1, y1, x, y) => {
		cubic(cx + 2 / 3 * (x1 - cx), cy + 2 / 3 * (y1 - cy), x + 2 / 3 * (x1 - x), y + 2 / 3 * (y1 - y), x, y);
	};
	const arc = (rx0, ry0, rotDeg, large, sweep, x, y) => {
		const x1 = cx;
		const y1 = cy;
		if (Math.abs(x - x1) < 1e-12 && Math.abs(y - y1) < 1e-12) return;
		let rx = Math.abs(rx0);
		let ry = Math.abs(ry0);
		if (rx < 1e-12 || ry < 1e-12) {
			line(x, y);
			return;
		}
		const phi = rotDeg * Math.PI / 180;
		const cosP = Math.cos(phi);
		const sinP = Math.sin(phi);
		const hx = (x1 - x) / 2;
		const hy = (y1 - y) / 2;
		const x1p = cosP * hx + sinP * hy;
		const y1p = -sinP * hx + cosP * hy;
		const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
		if (lam > 1) {
			const s = Math.sqrt(lam);
			rx *= s;
			ry *= s;
		}
		const rx2 = rx * rx;
		const ry2 = ry * ry;
		const xp2 = x1p * x1p;
		const yp2 = y1p * y1p;
		let rad = (rx2 * ry2 - rx2 * yp2 - ry2 * xp2) / (rx2 * yp2 + ry2 * xp2);
		if (rad < 0) rad = 0;
		const co = (large === sweep ? -1 : 1) * Math.sqrt(rad);
		const cxp = co * rx * y1p / ry;
		const cyp = -co * ry * x1p / rx;
		const ccx = cosP * cxp - sinP * cyp + (x1 + x) / 2;
		const ccy = sinP * cxp + cosP * cyp + (y1 + y) / 2;
		const th1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
		let dth = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx) - th1;
		if (sweep === 0 && dth > 0) dth -= TAU;
		else if (sweep === 1 && dth < 0) dth += TAU;
		const slices = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9));
		const delta = dth / slices;
		const alpha = 4 / 3 * Math.tan(delta / 4);
		const ex = (t) => ccx + rx * Math.cos(t) * cosP - ry * Math.sin(t) * sinP;
		const ey = (t) => ccy + rx * Math.cos(t) * sinP + ry * Math.sin(t) * cosP;
		const dx = (t) => -rx * Math.sin(t) * cosP - ry * Math.cos(t) * sinP;
		const dy = (t) => -rx * Math.sin(t) * sinP + ry * Math.cos(t) * cosP;
		let t0 = th1;
		let p0x = x1;
		let p0y = y1;
		for (let s = 1; s <= slices; s++) {
			const t1 = th1 + delta * s;
			const p1x = s === slices ? x : ex(t1);
			const p1y = s === slices ? y : ey(t1);
			cubic(p0x + alpha * dx(t0), p0y + alpha * dy(t0), p1x - alpha * dx(t1), p1y - alpha * dy(t1), p1x, p1y);
			t0 = t1;
			p0x = p1x;
			p0y = p1y;
		}
	};
	const finish = (closed) => {
		if (closed) line(pts[0], pts[1]);
		if (pts.length < 8) return null;
		return {
			pts: Float64Array.from(pts),
			closed
		};
	};
	return [
		cubic,
		line,
		quad,
		arc,
		finish
	];
}
function lowerSubpath(raw) {
	const [cubic, line, quad, arc, finish] = builder(raw.x0, raw.y0);
	for (const s of raw.segs) switch (s[0]) {
		case "L":
			line(s[1], s[2]);
			break;
		case "C":
			cubic(s[1], s[2], s[3], s[4], s[5], s[6]);
			break;
		case "Q":
			quad(s[1], s[2], s[3], s[4]);
			break;
		case "A": arc(s[1], s[2], s[3], s[4], s[5], s[6], s[7]);
	}
	return finish(raw.closed);
}
function attrNum(attrs, key, fallback = 0) {
	const v = attrs[key];
	if (v === void 0) return fallback;
	const x = typeof v === "number" ? v : Number(v);
	return Number.isFinite(x) ? x : fallback;
}
function parsePoints(v) {
	const s = String(v ?? "").trim();
	if (!s) return [];
	const nums = s.split(/[\s,]+/).map(Number);
	if (nums.some((x) => !Number.isFinite(x))) throw new Error(`morphicons: invalid points: "${s}"`);
	return nums;
}
function polyPath(nums, closed) {
	if (nums.length < 4) return null;
	const [, line, , , finish] = builder(nums[0], nums[1]);
	for (let i = 2; i + 1 < nums.length; i += 2) line(nums[i], nums[i + 1]);
	return finish(closed);
}
function ellipsePath(cx, cy, rx, ry) {
	if (rx < 1e-12 || ry < 1e-12) return null;
	const kx = KAPPA * rx;
	const ky = KAPPA * ry;
	const e = cx + rx;
	const w = cx - rx;
	const s = cy + ry;
	const n = cy - ry;
	const [cubic, , , , finish] = builder(e, cy);
	cubic(e, cy + ky, cx + kx, s, cx, s);
	cubic(cx - kx, s, w, cy + ky, w, cy);
	cubic(w, cy - ky, cx - kx, n, cx, n);
	cubic(cx + kx, n, e, cy - ky, e, cy);
	return finish(true);
}
function rectPath(attrs) {
	const x = attrNum(attrs, "x");
	const y = attrNum(attrs, "y");
	const w = attrNum(attrs, "width");
	const h = attrNum(attrs, "height");
	if (w < 1e-12 || h < 1e-12) return null;
	let rx = attrNum(attrs, "rx", NaN);
	let ry = attrNum(attrs, "ry", NaN);
	if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
	if (Number.isNaN(ry)) ry = rx;
	rx = Math.min(Math.max(rx, 0), w / 2);
	ry = Math.min(Math.max(ry, 0), h / 2);
	if (rx < 1e-12 || ry < 1e-12) return polyPath([
		x,
		y,
		x + w,
		y,
		x + w,
		y + h,
		x,
		y + h
	], true);
	const xa = x + rx;
	const xb = x + w - rx;
	const xr = x + w;
	const ya = y + ry;
	const yb = y + h - ry;
	const yd = y + h;
	const kx = KAPPA * rx;
	const ky = KAPPA * ry;
	const [cubic, line, , , finish] = builder(xa, y);
	line(xb, y);
	cubic(xb + kx, y, xr, ya - ky, xr, ya);
	line(xr, yb);
	cubic(xr, yb + ky, xb + kx, yd, xb, yd);
	line(xa, yd);
	cubic(xa - kx, yd, x, yb + ky, x, yb);
	line(x, ya);
	cubic(x, ya - ky, xa - kx, y, xa, y);
	return finish(true);
}
/** Icon (IconNode or `d` string) → list of cubic subpaths. */
function iconToCubics(input) {
	const out = [];
	const push = (p) => {
		if (p) out.push(p);
	};
	if (typeof input === "string") {
		for (const s of parsePath(input)) push(lowerSubpath(s));
		return out;
	}
	for (const [tag, attrs] of input) switch (tag) {
		case "path":
			for (const s of parsePath(String(attrs.d ?? ""))) push(lowerSubpath(s));
			break;
		case "line": {
			const [, line, , , finish] = builder(attrNum(attrs, "x1"), attrNum(attrs, "y1"));
			line(attrNum(attrs, "x2"), attrNum(attrs, "y2"));
			push(finish(false));
			break;
		}
		case "circle": {
			const r = attrNum(attrs, "r");
			push(ellipsePath(attrNum(attrs, "cx"), attrNum(attrs, "cy"), r, r));
			break;
		}
		case "ellipse":
			push(ellipsePath(attrNum(attrs, "cx"), attrNum(attrs, "cy"), attrNum(attrs, "rx"), attrNum(attrs, "ry")));
			break;
		case "rect":
			push(rectPath(attrs));
			break;
		case "polyline":
			push(polyPath(parsePoints(attrs.points), false));
			break;
		case "polygon":
			push(polyPath(parsePoints(attrs.points), true));
			break;
		default: throw new Error(`morphicons: unsupported tag <${tag}>`);
	}
	return out;
}
function parseViewBox(vb) {
	const v = typeof vb === "number" ? [
		0,
		0,
		vb,
		vb
	] : typeof vb === "string" ? vb.trim().split(/[\s,]+/).map(Number) : vb;
	const [minX, minY, w, h] = v;
	if (v.length !== 4 || !(w > 0) || !(h > 0) || !Number.isFinite(minX) || !Number.isFinite(minY)) throw new Error(`morphicons: invalid viewBox "${String(vb)}"`);
	return [
		minX,
		minY,
		w,
		h
	];
}
/** Re-grids an icon drawn on `viewBox` onto the shared `grid` (24 by default),
*  centred and preserving aspect ratio — the SVG `xMidYMid meet` rule.
*
*  Both endpoints of a morph must live on the same coordinate space. Lucide and
*  Tabler already draw on 24×24; packs on 20 (Heroicons solid) or 32 (Carbon)
*  do not, and mixing them unfitted makes Procrustes read the scale/offset gap
*  as rotation. Apply once at module scope (not per render) and pass the
*  resulting `d` anywhere an icon is accepted. */
function fitIcon(input, viewBox, grid = 24) {
	const [minX, minY, w, h] = parseViewBox(viewBox);
	const s = Math.min(grid / w, grid / h);
	const tx = (grid - w * s) / 2 - minX * s;
	const ty = (grid - h * s) / 2 - minY * s;
	const paths = iconToCubics(input);
	for (const { pts } of paths) for (let i = 0; i < pts.length; i += 2) {
		pts[i] = pts[i] * s + tx;
		pts[i + 1] = pts[i + 1] * s + ty;
	}
	return cubicsToPathD(paths);
}
//#endregion


    

//#region src/dom/index.ts
const tickers = /* @__PURE__ */ new Set();
let rafId = 0;
let last = -1;
function loop(ts) {
	const dt = last < 0 ? 0 : Math.min(Math.max((ts - last) / 1e3, 0), .1);
	last = ts;
	for (const tick of [...tickers]) tick(dt);
	if (tickers.size > 0) rafId = requestAnimationFrame(loop);
	else {
		rafId = 0;
		last = -1;
	}
}
function addTicker(tick) {
	tickers.add(tick);
	if (rafId === 0) {
		last = -1;
		rafId = requestAnimationFrame(loop);
	}
}
function removeTicker(tick) {
	tickers.delete(tick);
	if (tickers.size === 0 && rafId !== 0) {
		cancelAnimationFrame(rafId);
		rafId = 0;
		last = -1;
	}
}
const samples = /* @__PURE__ */ new WeakMap();
const canon = /* @__PURE__ */ new WeakMap();
const plans = /* @__PURE__ */ new WeakMap();
function sampledOf(icon) {
	if (typeof icon === "string") return resampleIcon(icon);
	let s = samples.get(icon);
	if (!s) {
		s = resampleIcon(icon);
		samples.set(icon, s);
	}
	return s;
}
/** Canonical `d` of an icon: the input string verbatim, or the real cubics
*  quantized to 4 decimals (the at-rest snap; engine-stable bytes so SSR
*  hydration matches, see fmtCanon in core/serialize). Exported because it
*  is what a binding renders at SSR/rest before any runtime exists. */
function canonicalD(icon) {
	if (typeof icon === "string") return icon;
	let d = canon.get(icon);
	if (!d) {
		d = cubicsToPathD(iconToCubics(icon));
		canon.set(icon, d);
	}
	return d;
}
function planBetween(src, dst) {
	if (typeof src === "string" || typeof dst === "string") return buildPlan(sampledOf(src), sampledOf(dst));
	let inner = plans.get(src);
	if (!inner) {
		inner = /* @__PURE__ */ new WeakMap();
		plans.set(src, inner);
	}
	let p = inner.get(dst);
	if (!p) {
		p = buildPlan(sampledOf(src), sampledOf(dst));
		inner.set(dst, p);
	}
	return p;
}
function resolveSpring(s) {
	if (typeof s === "string") return SPRING_PRESETS[s];
	const d = SPRING_PRESETS.snappy;
	return {
		k: s?.stiffness ?? d.k,
		c: s?.damping ?? d.c
	};
}
/** Creates the morph instance over a `<path>` and paints the initial icon. */
function createMorph(el, icon, options) {
	const spring = new Spring();
	let reducedMotion = options?.reducedMotion ?? "never";
	let target = icon;
	let rest = true;
	let plan = null;
	let out = null;
	let closed = null;
	let t = 1;
	let flying = false;
	let dead = false;
	el.setAttribute("d", canonicalD(icon));
	const render = (tt) => {
		const p = plan;
		const o = out;
		const cl = closed;
		if (!p || !o || !cl) return;
		t = tt;
		interpPolar(p, tt, o);
		el.setAttribute("d", serialize(o, cl));
	};
	const stop = () => {
		if (!flying) return;
		flying = false;
		removeTicker(tick);
	};
	const tick = (dt) => {
		const settled = spring.step(dt);
		render(spring.x);
		if (settled) {
			stop();
			settle();
		}
	};
	const settle = () => {
		rest = true;
		plan = null;
		out = null;
		closed = null;
		t = 1;
		spring.x = 1;
		spring.v = 0;
		el.setAttribute("d", canonicalD(target));
	};
	/** The current shape as plan source: the at-rest icon, or the rendered
	*  buffers (already N points per subpath). */
	const snapshot = () => {
		const p = plan;
		const o = out;
		if (rest || !p || !o) return sampledOf(target);
		return o.map((buf, k) => ({
			pts: Float64Array.from(buf),
			closed: p.items[k].closed
		}));
	};
	const retarget = (icon) => {
		plan = rest ? planBetween(target, icon) : buildPlan(snapshot(), sampledOf(icon));
		out = allocOutputs(plan);
		closed = plan.items.map((it) => it.closed);
		target = icon;
		rest = false;
	};
	const setNow = (icon) => {
		stop();
		target = icon;
		settle();
	};
	/** True when the policy says this morphTo must jump instead of flying. */
	const motionOff = () => {
		if (reducedMotion === "always") return true;
		if (reducedMotion !== "user") return false;
		if (typeof matchMedia === "undefined") return false;
		return matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
	};
	const seek = (icon, tt) => {
		if (dead) return;
		const reuse = !rest && plan !== null && icon === target;
		stop();
		spring.v = 0;
		if (!reuse) retarget(icon);
		render(tt);
	};
	return {
		morphTo(icon, sp) {
			if (dead) return;
			if (icon === target && (rest || flying)) return;
			if (motionOff()) {
				setNow(icon);
				return;
			}
			const { k, c } = resolveSpring(sp);
			spring.config(k, c);
			retarget(icon);
			spring.start();
			if (!flying) {
				flying = true;
				addTicker(tick);
			}
		},
		set(icon) {
			if (dead) return;
			setNow(icon);
		},
		seek,
		get progress() {
			return rest ? 1 : t;
		},
		set progress(v) {
			if (!dead) seek(target, v);
		},
		get reducedMotion() {
			return reducedMotion;
		},
		set reducedMotion(v) {
			reducedMotion = v;
		},
		destroy() {
			stop();
			dead = true;
			plan = null;
			out = null;
			closed = null;
		}
	};
}
//#endregion



    // Custom Spring tuning for visible, elegant, smooth morphing animations
    SPRING_PRESETS.smooth = { k: 130, c: 20 };
    SPRING_PRESETS.default = { k: 140, c: 20 };
    SPRING_PRESETS.snappy = { k: 180, c: 22 };
    SPRING_PRESETS.bouncy = { k: 160, c: 14 };

    const morphRegistry = new WeakMap();

    const Morphicons = {
        ICONS,
        resolveIcon,
        resolveD,
        createMorph,
        canonicalD,
        SPRING_PRESETS,

        svg(iconName, size = 22, className = '', strokeWidth = 2.4) {
            const d = resolveD(iconName);
            return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round" class="morphicon morphicon-' + (typeof iconName === 'string' ? iconName.toLowerCase() : '') + ' ' + className + '" data-icon="' + iconName + '"><path d="' + d + '" data-morph-path="true"></path></svg>';
        },

        render(container, iconName, size = 22, className = '', strokeWidth = 2.4) {
            if (typeof container === 'string') {
                container = document.querySelector(container);
            }
            if (!container) return null;

            const d = resolveD(iconName);
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', size);
            svg.setAttribute('height', size);
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', strokeWidth);
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            svg.setAttribute('class', 'morphicon morphicon-' + (typeof iconName === 'string' ? iconName.toLowerCase() : '') + ' ' + className);
            svg.dataset.icon = iconName;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.setAttribute('data-morph-path', 'true');
            svg.appendChild(path);

            const iconRaw = resolveIcon(iconName);
            if (iconRaw) {
                const morpher = createMorph(path, iconRaw);
                morphRegistry.set(svg, morpher);
                morphRegistry.set(path, morpher);
            }

            container.innerHTML = '';
            container.appendChild(svg);
            return svg;
        },

        morph(svgOrPath, toIconName, springPreset = 'smooth') {
            if (!svgOrPath) return;
            const path = svgOrPath.tagName === 'path' ? svgOrPath : (svgOrPath.querySelector ? (svgOrPath.querySelector('path[data-morph-path="true"]') || svgOrPath.querySelector('path')) : null);
            if (!path) return;

            const targetRaw = resolveIcon(toIconName);
            if (!targetRaw) {
                const targetD = resolveD(toIconName);
                if (targetD) path.setAttribute('d', targetD);
                return;
            }

            let morpher = morphRegistry.get(path) || (svgOrPath.tagName !== 'path' ? morphRegistry.get(svgOrPath) : null);
            if (!morpher) {
                const currentIconName = (svgOrPath.dataset && svgOrPath.dataset.icon) ? svgOrPath.dataset.icon : 'Mic';
                const currentRaw = resolveIcon(currentIconName) || targetRaw;
                morpher = createMorph(path, currentRaw);
                morphRegistry.set(path, morpher);
                if (svgOrPath.tagName !== 'path') morphRegistry.set(svgOrPath, morpher);
            }

            if (svgOrPath.dataset) {
                svgOrPath.dataset.icon = toIconName;
            }
            morpher.morphTo(targetRaw, springPreset);
        }
    };

    global.Morphicons = Morphicons;
})(typeof window !== 'undefined' ? window : globalThis);
