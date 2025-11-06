/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import React, { useState } from "react";
import {
  Button,
  Heading,
  Text,
  Flash,
  Label,
  ProgressBar,
  Spinner,
  TextInput,
  Textarea,
  Select,
  Checkbox,
  Radio,
  FormControl,
  ToggleSwitch,
  ActionList,
  CounterLabel,
  Avatar,
  Link,
  Truncate,
} from "@primer/react";
import {
  Box,
  Card,
  CloseableFlash,
  ContentLoader,
} from "@datalayer/primer-addons";
import {
  SearchIcon,
  CodeIcon,
  GitBranchIcon,
  IssueOpenedIcon,
  GitPullRequestIcon,
  CheckIcon,
  XIcon,
  AlertIcon,
} from "@primer/octicons-react";
import { PrimerVSCodeTheme } from "../theme/PrimerVSCodeTheme";

interface PrimerShowcaseProps {
  colorMode: "light" | "dark";
}

export function PrimerShowcase({ colorMode }: PrimerShowcaseProps) {
  console.log("PrimerShowcase rendering with colorMode:", colorMode);

  const [textValue, setTextValue] = useState("");
  const [selectValue, setSelectValue] = useState("option1");
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [radioValue, setRadioValue] = useState("option1");
  const [toggleEnabled, setToggleEnabled] = useState(false);

  return (
    <PrimerVSCodeTheme colorMode={colorMode}>
      <Box
        sx={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: 4,
          bg: "canvas.default",
          color: "fg.default",
          minHeight: "100vh",
        }}
      >
        <Heading sx={{ fontSize: 5, mb: 3, color: "fg.default" }}>
          Primer VSCode Theme Showcase
        </Heading>
        <Text as="p" sx={{ fontSize: 2, color: "fg.muted", mb: 4 }}>
          Primer React components styled with the active VSCode theme
        </Text>

        <Box sx={{ mb: 4 }}>
          <Heading as="h2" sx={{ fontSize: 3, mb: 2, color: "fg.default" }}>
            Buttons
          </Heading>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
            <Button variant="primary">Primary</Button>
            <Button variant="default">Default</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="invisible">Invisible</Button>
          </Box>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <Button variant="primary" leadingVisual={SearchIcon}>
              With Icon
            </Button>
            <Button variant="default" trailingVisual={GitBranchIcon}>
              Trailing Icon
            </Button>
            <Button variant="primary" size="small">
              Small
            </Button>
            <Button variant="primary" size="large">
              Large
            </Button>
          </Box>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Heading as="h2" sx={{ fontSize: 3, mb: 2, color: "fg.default" }}>
            Form Inputs
          </Heading>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              maxWidth: 500,
            }}
          >
            <FormControl>
              <FormControl.Label>Text Input</FormControl.Label>
              <TextInput
                leadingVisual={SearchIcon}
                placeholder="Search..."
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
              />
            </FormControl>

            <FormControl>
              <FormControl.Label>Textarea</FormControl.Label>
              <Textarea placeholder="Enter description..." rows={3} />
            </FormControl>

            <FormControl>
              <FormControl.Label>Select</FormControl.Label>
              <Select
                value={selectValue}
                onChange={(e) => setSelectValue(e.target.value)}
              >
                <Select.Option value="option1">Option 1</Select.Option>
                <Select.Option value="option2">Option 2</Select.Option>
                <Select.Option value="option3">Option 3</Select.Option>
              </Select>
            </FormControl>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Checkbox
                checked={checkboxChecked}
                onChange={(e) => setCheckboxChecked(e.target.checked)}
              />
              <Text>Enable notifications</Text>
            </Box>

            <FormControl>
              <FormControl.Label>Radio Group</FormControl.Label>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Radio
                    name="radio-group"
                    value="option1"
                    checked={radioValue === "option1"}
                    onChange={(e) => setRadioValue(e.target.value)}
                  />
                  <Text>Option 1</Text>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Radio
                    name="radio-group"
                    value="option2"
                    checked={radioValue === "option2"}
                    onChange={(e) => setRadioValue(e.target.value)}
                  />
                  <Text>Option 2</Text>
                </Box>
              </Box>
            </FormControl>

            <FormControl>
              <ToggleSwitch
                checked={toggleEnabled}
                onChange={(checked) => setToggleEnabled(checked)}
                aria-labelledby="toggle-label"
              />
              <FormControl.Label id="toggle-label">
                Toggle Switch
              </FormControl.Label>
            </FormControl>
          </Box>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Heading as="h2" sx={{ fontSize: 3, mb: 2, color: "fg.default" }}>
            Action List & Menu
          </Heading>
          <Box sx={{ maxWidth: 400 }}>
            <ActionList>
              <ActionList.Item>
                <ActionList.LeadingVisual>
                  <CodeIcon />
                </ActionList.LeadingVisual>
                Code
              </ActionList.Item>
              <ActionList.Item>
                <ActionList.LeadingVisual>
                  <IssueOpenedIcon />
                </ActionList.LeadingVisual>
                Issues
                <ActionList.TrailingVisual>
                  <CounterLabel>12</CounterLabel>
                </ActionList.TrailingVisual>
              </ActionList.Item>
              <ActionList.Item>
                <ActionList.LeadingVisual>
                  <GitPullRequestIcon />
                </ActionList.LeadingVisual>
                Pull Requests
                <ActionList.TrailingVisual>
                  <CounterLabel>5</CounterLabel>
                </ActionList.TrailingVisual>
              </ActionList.Item>
              <ActionList.Divider />
              <ActionList.Item variant="danger">
                <ActionList.LeadingVisual>
                  <XIcon />
                </ActionList.LeadingVisual>
                Delete
              </ActionList.Item>
            </ActionList>
          </Box>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Heading as="h2" sx={{ fontSize: 3, mb: 2, color: "fg.default" }}>
            Flash Messages
          </Heading>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Flash variant="success">
              <CheckIcon /> Success message with icon
            </Flash>
            <Flash variant="danger">
              <XIcon /> Error message with icon
            </Flash>
            <Flash variant="warning">
              <AlertIcon /> Warning message with icon
            </Flash>
          </Box>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Heading sx={{ fontSize: 3, mb: 2 }}>Labels & Counters</Heading>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
            <Label variant="primary">Primary</Label>
            <Label variant="success">Success</Label>
            <Label variant="danger">Danger</Label>
            <Label variant="attention">Attention</Label>
            <Label variant="accent">Accent</Label>
            <Label variant="done">Done</Label>
          </Box>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <CounterLabel>10</CounterLabel>
            <CounterLabel>99+</CounterLabel>
            <CounterLabel scheme="primary">5</CounterLabel>
          </Box>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Heading sx={{ fontSize: 3, mb: 2 }}>Avatars & Links</Heading>
          <Box
            sx={{
              display: "flex",
              gap: 3,
              alignItems: "center",
              flexWrap: "wrap",
              mb: 2,
            }}
          >
            <Avatar
              src="https://avatars.githubusercontent.com/primer"
              size={32}
            />
            <Avatar
              src="https://avatars.githubusercontent.com/github"
              size={48}
            />
            <Avatar
              src="https://avatars.githubusercontent.com/octocat"
              size={64}
            />
          </Box>
          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            <Link href="#" muted>
              Muted link
            </Link>
            <Link href="#">Regular link</Link>
            <Link href="#" sx={{ fontWeight: "bold" }}>
              Bold link
            </Link>
          </Box>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Heading sx={{ fontSize: 3, mb: 2 }}>Progress & Loading</Heading>
          <Box sx={{ mb: 3 }}>
            <Text
              sx={{ fontSize: 1, color: "fg.muted", mb: 1, display: "block" }}
            >
              Progress: 66%
            </Text>
            <ProgressBar progress={66} sx={{ mb: 2 }} />
            <Text
              sx={{ fontSize: 1, color: "fg.muted", mb: 1, display: "block" }}
            >
              Progress: 33%
            </Text>
            <ProgressBar progress={33} />
          </Box>
          <Box sx={{ display: "flex", gap: 3, alignItems: "center" }}>
            <Spinner size="small" />
            <Spinner size="medium" />
            <Spinner size="large" />
            <Text sx={{ fontSize: 1, color: "fg.muted" }}>Loading...</Text>
          </Box>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Heading sx={{ fontSize: 3, mb: 2 }}>Text Utilities</Heading>
          <Box sx={{ maxWidth: 300 }}>
            <Truncate title="This is a very long text that will be truncated">
              This is a very long text that will be truncated when it exceeds
              the container width
            </Truncate>
          </Box>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Heading sx={{ fontSize: 3, mb: 2, color: "fg.default" }}>
            Primer Addons - Cards
          </Heading>
          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            <Card border shadow="medium" rounded="medium" sx={{ width: 280 }}>
              <Card.Header title="Card Title" description="Subtitle" />
              <Card.Content>
                This is a card component from @datalayer/primer-addons. Cards
                are great for grouping related content.
              </Card.Content>
              <Card.Actions>
                <Button variant="primary" size="small">
                  Action
                </Button>
              </Card.Actions>
            </Card>

            <Card border shadow="medium" rounded="medium" sx={{ width: 280 }}>
              <Card.Header title="With Icon" leadingVisual={CodeIcon} />
              <Card.Content>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Text>
                    Cards can contain any Primer components including icons,
                    buttons, and more.
                  </Text>
                </Box>
              </Card.Content>
            </Card>
          </Box>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Heading sx={{ fontSize: 3, mb: 2, color: "fg.default" }}>
            Primer Addons - Closeable Flash
          </Heading>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <CloseableFlash
              variant="success"
              onClose={() => console.log("Success flash closed")}
            >
              <CheckIcon /> This is a closeable success message from
              primer-addons
            </CloseableFlash>
            <CloseableFlash
              variant="warning"
              onClose={() => console.log("Warning flash closed")}
            >
              <AlertIcon /> This warning message can be dismissed
            </CloseableFlash>
          </Box>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Heading sx={{ fontSize: 3, mb: 2, color: "fg.default" }}>
            Primer Addons - Content Loader
          </Heading>
          <Text sx={{ fontSize: 1, color: "fg.muted", mb: 2 }}>
            Skeleton loading placeholders for better UX
          </Text>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <ContentLoader count={3} />
            <ContentLoader count={2} />
          </Box>
        </Box>

        <Box
          sx={{
            mt: 5,
            pt: 4,
            borderTop: "1px solid",
            borderColor: "border.default",
            textAlign: "center",
          }}
        >
          <Text sx={{ color: "fg.muted", fontSize: 1 }}>
            Primer VSCode Theme Showcase • Built with @primer/react &
            @datalayer/primer-addons
          </Text>
        </Box>
      </Box>
    </PrimerVSCodeTheme>
  );
}
